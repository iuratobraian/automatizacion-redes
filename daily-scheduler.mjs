/**
 * daily-scheduler.mjs — TradeShare Content Scheduler
 * Publica automáticamente 5 veces por día en los horarios de mayor tráfico:
 *   07:00 | 12:00 | 16:00 | 19:00 | 22:00 (hora Argentina)
 * En cada slot publica: Feed IG + Historia IG + Threads + Facebook
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Horarios de publicación (hora local Argentina) ───────────────────────────
// Formato: [hora, minuto]
const SLOTS = [
  [7, 0],   // Mañana temprano — commuters
  [12, 0],  // Mediodía — pausa laboral
  [16, 0],  // Tarde — pico pre-cierre
  [19, 0],  // Noche temprana — pico principal
  [22, 0],  // Noche — último engagement del día
];

// ─── Estado ──────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(ROOT, ".agent", "scheduler_state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastRuns: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function slotKey(slot) {
  return `${slot[0].toString().padStart(2, "0")}:${slot[1].toString().padStart(2, "0")}`;
}

function todayDateStr() {
  return new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

function currentHourMin() {
  const now = new Date();
  const parts = now.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).split(":");
  return [parseInt(parts[0]), parseInt(parts[1])];
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [SCHEDULER] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(ROOT, ".agent", "scheduler_log.txt"), line + "\n");
  } catch {}
}

// ─── Ejecución de una tarea ───────────────────────────────────────────────────
function runCmd(cmd, label) {
  log(`▶️  Ejecutando: ${label}`);
  try {
    const out = execSync(cmd, { cwd: ROOT, timeout: 180_000, encoding: "utf8" });
    log(`✅ ${label} completado.`);
    return out;
  } catch (e) {
    log(`❌ ${label} falló: ${e.message}`);
    return null;
  }
}

// ─── Rutina completa de publicación ──────────────────────────────────────────
async function publishingRound(slotLabel) {
  log(`🚀 === RONDA DE PUBLICACIÓN — Slot ${slotLabel} ===`);

  // 1. Generar imagen y caption con el orchestrator
  const orchOut = runCmd(
    "node automatizacion-redes/marketing-loop-orchestrator.mjs --manual",
    "Generación de contenido"
  );

  // Obtener la última entrada del vault para saber imagen y caption
  let imageFile = null;
  let caption = null;
  try {
    const vault = JSON.parse(
      fs.readFileSync(path.join(ROOT, ".agent", "marketing_vault.json"), "utf8")
    );
    if (vault.length > 0) {
      const last = vault[vault.length - 1];
      imageFile = last.imagePath || last.imageFile || null;
      caption = last.caption || last.text || null;
    }
  } catch {}

  if (!imageFile || !fs.existsSync(imageFile)) {
    log("⚠️  No se encontró imagen generada. Saltando publicación.");
    return;
  }

  const safeCaption = (caption || "¡Mentalidad de Trading! 🚀 #tradeshare").replace(/"/g, '\\"');

  // 2. Publicar en Feed de Instagram (escritorio)
  runCmd(
    `node automatizacion-redes/ig-publisher.mjs --type=feed --account=tradeshare.ok --image="${imageFile}" --caption="${safeCaption}"`,
    "Instagram Feed (tradeshare.ok)"
  );

  // 3. Publicar historia en Instagram (móvil)
  runCmd(
    `node automatizacion-redes/ig-publisher.mjs --type=story --account=tradeshare.ok --image="${imageFile}" --caption="${safeCaption}"`,
    "Instagram Historia (tradeshare.ok)"
  );

  // 4. Publicar en Threads
  runCmd(
    `node automatizacion-redes/threads-publisher.mjs --text="${safeCaption}"`,
    "Threads"
  );

  // 5. Publicar en Facebook
  runCmd(
    `node automatizacion-redes/facebook-publisher.mjs --text="${safeCaption}"`,
    "Facebook Groups"
  );

  log(`✅ === Ronda ${slotLabel} completada ===`);
}

// ─── Loop principal ───────────────────────────────────────────────────────────
async function main() {
  log("⏰ Scheduler iniciado. Verificando slots cada 60 segundos...");

  while (true) {
    const state = loadState();
    const [currentH, currentM] = currentHourMin();
    const today = todayDateStr();

    for (const slot of SLOTS) {
      const [slotH, slotM] = slot;
      const key = slotKey(slot);
      const stateKey = `${today}_${key}`;

      // ¿Estamos dentro de los 5 minutos del slot? ¿Ya corrió hoy?
      const diffMin = (currentH - slotH) * 60 + (currentM - slotM);
      const shouldRun = diffMin >= 0 && diffMin < 5;

      if (shouldRun && !state.lastRuns[stateKey]) {
        state.lastRuns[stateKey] = new Date().toISOString();
        saveState(state);
        await publishingRound(key);
      }
    }

    // Limpiar entradas viejas del state (>7 días)
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    for (const k of Object.keys(state.lastRuns)) {
      if (k.split("_")[0] < cutoff) delete state.lastRuns[k];
    }
    saveState(state);

    await new Promise((r) => setTimeout(r, 60_000)); // revisar cada 60s
  }
}

main().catch((e) => {
  log(`💥 Scheduler falló fatalmente: ${e.message}`);
  process.exit(1);
});
