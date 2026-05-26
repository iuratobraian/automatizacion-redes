/**
 * daily-scheduler.mjs — TradeShare Content Scheduler (V2 - Queue Based)
 * Publica automáticamente 10 veces por día pullando de la bóveda (marketing_vault.json).
 * Si no hay contenido listo, genera uno nuevo.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VAULT_PATH = path.join(ROOT, ".agent", "marketing_vault.json");
const LOG_FILE = path.join(ROOT, ".agent", "scheduler_log.txt");

// ─── 10 Slots de publicación (hora local Argentina) ───────────────────────────
const SLOTS = [
  [0, 0], [7, 0], [9, 0], [12, 0], [14, 0], [16, 0], [18, 0], [20, 0], [22, 0], [23, 30]
];

const STATE_FILE = path.join(ROOT, ".agent", "scheduler_state_v2.json");
const CONFIG_PATH = path.join(ROOT, ".agent", "ig-config.json");

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch (e) {
    log(`Error cargando ig-config.json: ${e.message}`);
  }
  return {};
}

function loadConfigSlots() {
  const defaultSlots = [
    [0, 0], [7, 0], [9, 0], [12, 0], [14, 0], [16, 0], [18, 0], [20, 0], [22, 0], [23, 30]
  ];
  const config = loadConfig();
  if (config.slots && Array.isArray(config.slots)) {
    return config.slots;
  }
  return defaultSlots;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } 
  catch { return { lastRuns: {} }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function log(msg) {
  const line = `[${new Date().toISOString()}] [SCHEDULER] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

function runCmd(cmd, label) {
  log(`▶️ Ejecutando: ${label}`);
  try {
    const out = execSync(cmd, { cwd: ROOT, timeout: 240_000, encoding: "utf8" });
    log(`✅ ${label} completado.`);
    return { success: true, out };
  } catch (e) {
    log(`❌ ${label} falló: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ─── Lógica de obtención de contenido (Cola) ──────────────────────────────────
function getNextFromQueue() {
    if (!fs.existsSync(VAULT_PATH)) return null;
    try {
        const vault = JSON.parse(fs.readFileSync(VAULT_PATH, "utf8"));
        const index = vault.findIndex(item => !item.instagramFeedUrl);
        if (index !== -1) {
            return { entry: vault[index], index };
        }
    } catch (e) { log(`Error leyendo vault: ${e.message}`); }
    return null;
}

function markAsPublished(index, feedUrl) {
    try {
        const vault = JSON.parse(fs.readFileSync(VAULT_PATH, "utf8"));
        vault[index].instagramFeedUrl = feedUrl || "https://published.social";
        vault[index].publishedAt = new Date().toISOString();
        fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2));
        log(`💾 Entrada #${index} marcada como publicada en el vault.`);
    } catch (e) { log(`Error guardando vault: ${e.message}`); }
}

// ─── Rutina de publicación ───────────────────────────────────────────────────
async function publishingRound(slotLabel) {
  log(`🚀 === INICIANDO PUBLICACIÓN — Slot ${slotLabel} ===`);

  let content = selectRotativeContent(slotLabel.includes("story") ? "story" : "feed");
  
  if (!content) {
    log("⚠️ No se pudo obtener contenido rotativo local. Usando cola del vault...");
    content = getNextFromQueue();
  }

  if (!content) {
    log("⚠️ Cola vacía. Generando contenido nuevo en tiempo real...");
    const gen = runCmd("node automatizacion-redes/marketing-loop-orchestrator.mjs --generate-only", "Generación de Emergencia");
    if (!gen.success) {
        log("❌ No se pudo generar contenido. Abortando slot.");
        return;
    }
    content = getNextFromQueue();
  }

  if (!content) {
    log("❌ Sigue sin haber contenido después de generar. Abortando.");
    return;
  }

  const { Phrase, PhraseCopy, ImagePath } = {
    Phrase: content.frase || content.entry?.frase,
    PhraseCopy: content.copy || content.entry?.copy,
    ImagePath: content.imagePath || (content.entry ? (content.entry.imagePath || path.join(ROOT, content.entry.imagenUrl.startsWith('/') ? `public${content.entry.imagenUrl}` : content.entry.imagenUrl)) : null)
  };

  const safeCaption = `${Phrase}\n\n${PhraseCopy}\n\n#TradeShare #Trading #Forex #Automatizacion`.replace(/"/g, '\\"');

  if (!ImagePath || !fs.existsSync(ImagePath)) {
      log(`❌ Imagen no encontrada: ${ImagePath}. Saltando entrada.`);
      return;
  }

  log(`📢 Publicando entrada rotativa: ${Phrase} (${ImagePath})`);

  const config = loadConfig();
  const channels = config.channels || { instagramFeed: true, instagramStory: true, threads: true, facebook: true };

  // Determinar si es Story o Feed según el slot label
  const isStorySlot = slotLabel.includes("story");

  if (isStorySlot) {
    if (channels.instagramStory) {
      runCmd(`node automatizacion-redes/ig-publisher.mjs --type=story --image="${ImagePath}"`, "IG Story");
    }
  } else {
    // 1. Instagram Feed
    if (channels.instagramFeed) {
      runCmd(`node automatizacion-redes/ig-publisher.mjs --type=feed --image="${ImagePath}" --caption="${safeCaption}"`, "IG Feed");
    }
    // 2. Threads
    if (channels.threads) {
      runCmd(`node automatizacion-redes/threads-publisher.mjs --text="${safeCaption}"`, "Threads");
    }
    // 3. Facebook
    if (channels.facebook) {
      runCmd(`node automatizacion-redes/facebook-publisher.mjs --text="${safeCaption}"`, "Facebook");
    }
  }

  log(`✅ === Fin de ronda Slot ${slotLabel} ===`);
}

// Configurar los 15 slots dinámicos diarios (5 Feed + 10 Historias)
// 5 Feeds: 04:00, 08:30, 10:30, 15:00, 21:00
// 10 Historias: Cada 1.5 horas de 08:00 a 22:00
const DYNAMIC_SLOTS = [
  // Feeds
  { h: 4, m: 0, label: "feed_1" },
  { h: 8, m: 30, label: "feed_2" },
  { h: 10, m: 30, label: "feed_3" },
  { h: 15, m: 0, label: "feed_4" },
  { h: 21, m: 0, label: "feed_5" },
  // Stories
  { h: 8, m: 0, label: "story_1" },
  { h: 9, m: 30, label: "story_2" },
  { h: 11, m: 0, label: "story_3" },
  { h: 12, m: 30, label: "story_4" },
  { h: 14, m: 0, label: "story_5" },
  { h: 15, m: 30, label: "story_6" },
  { h: 17, m: 0, label: "story_7" },
  { h: 18, m: 30, label: "story_8" },
  { h: 20, m: 0, label: "story_9" },
  { h: 21, m: 30, label: "story_10" }
];

import { selectRotativeContent } from "./content-rotator.mjs";

async function main() {
  log("⏰ Daily Scheduler PRO V3 (Dynamic 15 Slots / Content Rotator) iniciado.");
  
  while (true) {
    const state = loadState();
    const now = new Date();
    const today = now.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    const timeStr = now.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false });
    const [currentH, currentM] = timeStr.split(':').map(Number);

    for (const slot of DYNAMIC_SLOTS) {
        const key = `${today}_${slot.label}`;
        
        const diffMin = (currentH - slot.h) * 60 + (currentM - slot.m);
        
        if (diffMin >= 0 && diffMin < 5 && !state.lastRuns[key]) {
            state.lastRuns[key] = new Date().toISOString();
            saveState(state);
            await publishingRound(slot.label);
        }
    }

    await new Promise(r => setTimeout(r, 60_000));
  }
}

main().catch(e => {
  log(`💥 Scheduler falló fatalmente: ${e.message}`);
  process.exit(1);
});
