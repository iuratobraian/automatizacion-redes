/**
 * daily-scheduler.mjs — TradeShare Content Scheduler (V3 - Pre-Scheduled DB Calendar)
 * Pre-programa automáticamente 15 slots diarios (5 feed, 10 historias) para los próximos 7 días
 * directamente en la base de datos (posts-db.json y marketing_vault.json), copiando las imágenes
 * desde las carpetas del Escritorio a la carpeta pública del servidor para que sean visibles
 * de inmediato en el calendario del Dashboard. Luego, publica de forma autónoma a la hora del slot.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { selectRotativeContent, FEED_DIR, STORIES_DIR, COPIES_LIBRARY, CTAS } from "./content-rotator.mjs";
import { readPostsDB, savePostsDB } from "./data-manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VAULT_PATH = path.join(ROOT, ".agent", "marketing_vault.json");
const LOG_FILE = path.join(ROOT, ".agent", "scheduler_log.txt");

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

// ─── Lógica de obtención de contenido (Cola Fallback) ───────────────────────────
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

// Configurar los 15 slots dinámicos diarios (5 Feed + 10 Historias)
// 5 Feeds: 04:00, 08:30, 10:30, 15:00, 21:00
// 10 Historias: Cada 1.5 horas de 08:00 a 22:00
// Configurar los 20 slots dinámicos diarios (10 Feed + 10 Historias)
// 10 Feeds distribuidos equitativamente para una UX viva y fluida
// 10 Historias: Cada 1.5 horas de 08:00 a 22:00
const DYNAMIC_SLOTS = [
  // 10 Feeds Diarios
  { h: 2, m: 0, label: "feed_1" },
  { h: 4, m: 0, label: "feed_2" },
  { h: 6, m: 0, label: "feed_3" },
  { h: 8, m: 0, label: "feed_4" },
  { h: 10, m: 0, label: "feed_5" },
  { h: 12, m: 0, label: "feed_6" },
  { h: 14, m: 0, label: "feed_7" },
  { h: 16, m: 0, label: "feed_8" },
  { h: 18, m: 0, label: "feed_9" },
  { h: 21, m: 0, label: "feed_10" },
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

// Conversión de fecha local Argentina (UTC-3) a UTC para programación exacta
function getSlotUtcDate(dateStr, slotHour, slotMin) {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Argentina está en UTC-3, por lo que sumamos 3 al horario local para obtener UTC
  return new Date(Date.UTC(year, month - 1, day, slotHour + 3, slotMin, 0, 0));
}

// ─── Helper: MD5 hash de archivo para deduplicación real ──────────────────────
function computeFileHash(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch { return null; }
}

// ─── Rutina para pre-programar los próximos 7 días en el Dashboard Calendar ───
function ensureSevenDaysScheduled() {
  log("🔍 Verificando programación de publicaciones en base de datos para los próximos 7 días...");
  const db = readPostsDB();
  let changed = false;

  // Cargar lista de archivos desde la FUENTE ÚNICA (~/Escritorio/media/feed y /historias)
  const feedFiles = fs.existsSync(FEED_DIR) 
    ? fs.readdirSync(FEED_DIR).filter(f => /\.(png|jpe?g|webp)$/i.test(f))
    : [];
  const storyFiles = fs.existsSync(STORIES_DIR)
    ? fs.readdirSync(STORIES_DIR).filter(f => /\.(png|jpe?g|webp)$/i.test(f))
    : [];

  if (feedFiles.length === 0 || storyFiles.length === 0) {
    log("⚠️ No hay imágenes suficientes. Activando autogeneración autónoma de emergencia...");
    runCmd("node automatizacion-redes/marketing-loop-orchestrator.mjs --generate-only", "Autogeneración Autónoma de Emergencia");
  }

  // Recopilar hashes de imágenes YA programadas (no publicadas aún) para evitar duplicar contenido real
  const scheduledHashes = new Set(
    db.posts
      .filter(p => p.status === "Scheduled" && p.filepath && fs.existsSync(path.resolve(ROOT, p.filepath.replace(/^\.?\//, ''))))
      .map(p => computeFileHash(path.resolve(ROOT, p.filepath.replace(/^\.?\//, ''))))
      .filter(Boolean)
  );

  // Generar fechas para los próximos 7 días (incluido hoy)
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date();
    const localMs = targetDate.getTime() - (3 * 60 * 60 * 1000);
    const targetLocalDate = new Date(localMs);
    targetLocalDate.setDate(targetLocalDate.getDate() + i);
    
    const year = targetLocalDate.getUTCFullYear();
    const month = String(targetLocalDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(targetLocalDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    for (const slot of DYNAMIC_SLOTS) {
      const slotUtcDate = getSlotUtcDate(dateStr, slot.h, slot.m);
      const scheduledISO = slotUtcDate.toISOString();

      const exists = db.posts.some(post => 
        post.scheduled.some(sched => sched.scheduledAt === scheduledISO)
      );

      if (!exists) {
        const isFeed = slot.label.startsWith("feed");
        let sourcePath = null;
        let destFilename = null;
        let phrase = "";
        let fullCaptionText = "";

        // Seleccionar imagen desde la fuente ÚNICA evitando duplicados por hash
        const dir = isFeed ? FEED_DIR : STORIES_DIR;
        const files = isFeed ? feedFiles : storyFiles;

        if (files.length > 0) {
          // Ordenar por hash para un recorrido determinista, luego filtrar usadas
          const candidates = files
            .map(f => ({ f, abs: path.join(dir, f), hash: computeFileHash(path.join(dir, f)) }))
            .filter(c => c.hash && !scheduledHashes.has(c.hash));

          let chosen = null;
          if (candidates.length > 0) {
            // Elegir aleatoriamente entre los no usados
            chosen = candidates[Math.floor(Math.random() * candidates.length)];
          } else {
            // Todas usadas: reiniciar ciclo
            scheduledHashes.clear();
            const allCandidates = files.map(f => ({ f, abs: path.join(dir, f), hash: computeFileHash(path.join(dir, f)) })).filter(c => c.hash);
            chosen = allCandidates[Math.floor(Math.random() * allCandidates.length)];
          }

          if (chosen) {
            sourcePath = chosen.abs;
            scheduledHashes.add(chosen.hash);
            destFilename = `${Date.now()}_${chosen.f.replace(/\s+/g, '_')}`;
            const template = COPIES_LIBRARY[Math.floor(Math.random() * COPIES_LIBRARY.length)];
            phrase = template.frase;
            fullCaptionText = template.copy;
          }
        }

        // Si no hay archivos locales, intentar el vault de marketing
        if (!sourcePath && fs.existsSync(VAULT_PATH)) {
          try {
            const vault = JSON.parse(fs.readFileSync(VAULT_PATH, "utf8"));
            const isStory = !isFeed;
            const availableInVault = vault.filter(item => {
              const pathStr = item.imagenUrl || "";
              return isStory ? pathStr.includes("historias") : pathStr.includes("feed");
            });

            if (availableInVault.length > 0) {
              const entry = availableInVault[Math.floor(Math.random() * availableInVault.length)];
              phrase = entry.frase || "Estrategia TradeShare";
              fullCaptionText = (entry.copy || "")
                .replace(/Comenta [A-Z]+ abajo/g, "")
                .replace(/Comentá la palabra "[^"]+" abajo/g, "")
                .replace(/comentá la palabra "[^"]+"/gi, "")
                .replace(/Comentá la palabra [A-Z]+/gi, "")
                .replace(/#\w+/g, "")
                .trim();
              const imageName = path.basename(entry.imagenUrl);
              destFilename = `${Date.now()}_${imageName}`;
              const sourceSubPath = entry.imagenUrl.replace(/^\//, "");
              sourcePath = path.join(ROOT, "public", sourceSubPath);
              if (!fs.existsSync(sourcePath)) {
                sourcePath = path.join(ROOT, "public", "generated_posts", imageName);
              }
            }
          } catch (e) {
            log(`Error leyendo vault para programación autónoma: ${e.message}`);
          }
        }

        if (!sourcePath || !fs.existsSync(sourcePath)) {
          continue;
        }

        // Copiar archivo a la carpeta public del proyecto para que el dashboard lo sirva
        const MEDIA_DIR_FEED = path.join(ROOT, 'public', 'images', 'feed');
        const MEDIA_DIR_HISTORIAS = path.join(ROOT, 'public', 'images', 'historias');
        const destFolder = isFeed ? MEDIA_DIR_FEED : MEDIA_DIR_HISTORIAS;
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder, { recursive: true });
        }
        
        const destPath = path.join(destFolder, destFilename);

        try {
          fs.copyFileSync(sourcePath, destPath);
          log(`📂 Copiada imagen: ${path.basename(sourcePath)} -> ${destPath}`);
        } catch (err) {
          log(`❌ Error copiando imagen: ${err.message}`);
          continue;
        }

        const serveUrl = isFeed ? `/images/feed/${destFilename}` : `/images/historias/${destFilename}`;
        const relativeFilePath = isFeed ? `./public/images/feed/${destFilename}` : `./public/images/historias/${destFilename}`;

        const postID = `post_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const schedID = `s_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        const newPost = {
          id: postID,
          filename: serveUrl,
          filepath: relativeFilePath,
          source: "auto-generated",
          title: phrase,
          category: "Trading",
          tags: ["auto-generated", "rotative"],
          status: "Scheduled",
          captions: [{
            id: "c1",
            label: "Caption Principal",
            text: fullCaptionText,
            isDefault: true,
            platform_variants: {
              ig_feed: fullCaptionText,
              ig_story: phrase,
              threads: fullCaptionText
            },
            createdAt: new Date().toISOString()
          }],
          scheduled: [{
            id: schedID,
            scheduledAt: scheduledISO,
            destinations: isFeed ? ["ig_feed", "threads", "facebook", "tradeshare"] : ["ig_story"],
            captionId: "c1",
            status: "pending",
            type: isFeed ? "feed" : "story"
          }],
          published: [],
          createdAt: new Date().toISOString()
        };

        db.posts.push(newPost);
        changed = true;
        log(`🗓️ Pre-programado Slot: ${slot.label} para ${dateStr} ${slot.h}:${slot.m} (UTC: ${scheduledISO})`);
      }
    }
  }

  if (changed) {
    savePostsDB(db);
    log("💾 Base de datos posts-db.json actualizada con las nuevas programaciones.");
  } else {
    log("✓ Todos los slots de los próximos 7 días ya están programados.");
  }
}

// ─── Rutina de publicación ──────────────────────────────────────────
async function executePublishing(Phrase, PhraseCopy, ImagePath, slotLabel, destinations = []) {
  const safeCaption = `${Phrase}\n\n${PhraseCopy}\n\n#TradeShare #Trading #Forex #Automatizacion`.replace(/"/g, '\\"');

  if (!ImagePath || !fs.existsSync(ImagePath)) {
      log(`❌ Imagen no encontrada en: ${ImagePath}. Saltando publicación.`);
      return false;
  }

  log(`📢 Publicando entrada: "${Phrase}" desde ${ImagePath}`);

  const config = loadConfig();
  const channels = config.channels || { instagramFeed: true, instagramStory: true, threads: true, facebook: true };

  const isStorySlot = slotLabel.includes("story");
  let anySuccess = false;

  const activeDestinations = destinations.length > 0 ? destinations : (isStorySlot ? ["ig_story"] : ["ig_feed", "threads", "facebook", "tradeshare"]);

  if (isStorySlot) {
    if (channels.instagramStory) {
      const res = runCmd(`node automatizacion-redes/ig-publisher.mjs --type=story --image="${ImagePath}"`, "IG Story");
      if (res.success) anySuccess = true;
    }
  } else {
    // 1. Instagram Feed
    if (channels.instagramFeed && activeDestinations.includes("ig_feed")) {
      const res = runCmd(`node automatizacion-redes/ig-publisher.mjs --type=feed --image="${ImagePath}" --caption="${safeCaption}"`, "IG Feed");
      if (res.success) anySuccess = true;
    }
    // 2. Threads
    if (channels.threads && activeDestinations.includes("threads")) {
      const res = runCmd(`node automatizacion-redes/threads-publisher.mjs --text="${safeCaption}"`, "Threads");
      if (res.success) anySuccess = true;
    }
    // 3. Facebook
    if (channels.facebook && activeDestinations.includes("facebook")) {
      const res = runCmd(`node automatizacion-redes/facebook-publisher.mjs --text="${safeCaption}"`, "Facebook");
      if (res.success) anySuccess = true;
    }
    // 4. TradeShare
    if (activeDestinations.includes("tradeshare")) {
      try {
        const cleanTitulo = (Phrase || 'Trading Mindset').replace(/"/g, '\\"');
        const cleanContenido = (PhraseCopy || '').replace(/"/g, '\\"');
        const cleanCategoria = 'Psicología'.replace(/"/g, '\\"');
        const baseName = path.basename(ImagePath);
        const cleanImagenUrl = `/images/feed/${baseName}`;

        const argsObj = {
          titulo: cleanTitulo,
          contenido: cleanContenido,
          categoria: cleanCategoria,
          imagenUrl: cleanImagenUrl,
          userId: 'admin_braiurato',
          isAiAgent: true,
          sentiment: 'neutral'
        };

        const cmd = `npx convex run posts:createPost '${JSON.stringify(argsObj)}'`;
        const res = runCmd(cmd, "TradeShare Feed");
        if (res.success) anySuccess = true;
      } catch (err) {
        log(`❌ Error al publicar en TradeShare Feed: ${err.message}`);
      }
    }
  }
  
  return anySuccess;
}

// ─── Rutina de publicación ───────────────────────────────────────────────────
async function publishingRound(slotLabel) {
  log(`🚀 === INICIANDO PUBLICACIÓN — Slot ${slotLabel} ===`);

  // Encontrar el post pre-programado para este slot
  const db = readPostsDB();
  const now = new Date();
  
  const isStory = slotLabel.includes("story");
  const targetType = isStory ? "story" : "feed";
  
  let foundPost = null;
  let foundSched = null;
  
  for (const post of db.posts) {
    for (const sched of post.scheduled) {
      if (sched.status === 'pending' && (sched.type === targetType || (targetType === 'feed' && sched.destinations.includes('ig_feed')))) {
        const schedTime = new Date(sched.scheduledAt);
        const diffMs = now - schedTime;
        // Permitir un margen de -5 minutos a +2 horas en caso de reinicio de servidor
        if (diffMs >= -300_000 && diffMs <= 7200_000) {
          foundPost = post;
          foundSched = sched;
          break;
        }
      }
    }
    if (foundPost) break;
  }

  if (foundPost) {
    log(`🎯 Encontrado post pre-programado en base de datos: "${foundPost.title}" (${foundPost.filename})`);
    
    const Phrase = foundPost.title;
    const PhraseCopy = foundPost.captions.find(c => c.id === foundSched.captionId)?.text || foundPost.captions[0]?.text || "";
    const ImagePath = path.join(ROOT, foundPost.filepath);
    
    const success = await executePublishing(Phrase, PhraseCopy, ImagePath, slotLabel, foundSched.destinations);
    
    if (success) {
      foundSched.status = "published";
      foundPost.status = "Posted";
      foundPost.published.push({
        publishedAt: new Date().toISOString(),
        destinations: foundSched.destinations,
        captionId: foundSched.captionId,
        link: "https://published.social"
      });
      savePostsDB(db);
      log(`💾 Marcado post ${foundPost.id} como publicado exitosamente.`);
    } else {
      log(`❌ Falló la publicación del post pre-programado ${foundPost.id}.`);
    }
    log(`✅ === Fin de ronda Slot ${slotLabel} ===`);
    return;
  }

  log(`⚠️ No se encontró post pre-programado en la base de datos para este slot. Usando fallback al vuelo...`);

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

  await executePublishing(Phrase, PhraseCopy, ImagePath, slotLabel);
  log(`✅ === Fin de ronda Slot ${slotLabel} ===`);
}

function healDatabaseCaptions() {
  log("🩹 Ejecutando rutina de auto-curación y sanado de captions en la base de datos...");
  const db = readPostsDB();
  let changed = false;

  db.posts.forEach(post => {
    if (!post.captions || post.captions.length === 0) {
      const template = COPIES_LIBRARY[Math.floor(Math.random() * COPIES_LIBRARY.length)];
      const cta = CTAS[Math.floor(Math.random() * CTAS.length)];
      const captionText = `${template.copy}\n\n👉 ${cta}`;
      
      post.captions = [{
        id: "c1",
        label: "Caption Principal",
        text: captionText,
        isDefault: true,
        platform_variants: {
          ig_feed: captionText,
          ig_story: template.frase,
          threads: captionText
        },
        createdAt: new Date().toISOString()
      }];
      changed = true;
      log(`🩹 Reparado post ${post.id}: Creado caption premium completo.`);
    } else {
      const firstCap = post.captions[0];
      const textLength = firstCap && firstCap.text ? firstCap.text.trim().length : 0;
      const isShort = textLength < 80;
      const isSameAsTitle = firstCap && firstCap.text && firstCap.text.trim().toLowerCase() === post.title.trim().toLowerCase();

      if (firstCap && (!firstCap.text || isShort || isSameAsTitle)) {
        const template = COPIES_LIBRARY[Math.floor(Math.random() * COPIES_LIBRARY.length)];
        const cta = CTAS[Math.floor(Math.random() * CTAS.length)];
        const captionText = `${template.copy}\n\n👉 ${cta}`;
        
        firstCap.text = captionText;
        if (!firstCap.platform_variants) {
          firstCap.platform_variants = {};
        }
        firstCap.platform_variants.ig_feed = captionText;
        firstCap.platform_variants.ig_story = template.frase;
        firstCap.platform_variants.threads = captionText;
        changed = true;
        log(`🩹 Reparado post ${post.id}: Reemplazada descripción corta/repetida por copia premium completa.`);
      }
    }
  });

  if (changed) {
    savePostsDB(db);
    log("💾 Base de datos posts-db.json sanada y guardada con éxito.");
  } else {
    log("✓ Base de datos validada: todos los posts tienen captions óptimas.");
  }
}

async function main() {
  log("⏰ Daily Scheduler PRO V3 (Pre-Scheduled DB Calendar) iniciado.");
  
  // Ejecutar rutina de auto-curación de base de datos
  try {
    healDatabaseCaptions();
  } catch (err) {
    log(`❌ Error ejecutando auto-curación de base de datos: ${err.message}`);
  }
  
  // Asegurar programación de 7 días al arrancar el servidor
  try {
    ensureSevenDaysScheduled();
  } catch (err) {
    log(`❌ Error en programación inicial al arrancar: ${err.message}`);
  }
  
  while (true) {
    const state = loadState();
    const now = new Date();
    const today = now.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    const timeStr = now.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false });
    const [currentH, currentM] = timeStr.split(':').map(Number);

    // Todos los días a las 00:05 local de Argentina asegurar programación de los próximos 7 días
    if (currentH === 0 && currentM === 5) {
      try {
        ensureSevenDaysScheduled();
      } catch (err) {
        log(`❌ Error en programación automática diaria: ${err.message}`);
      }
    }

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
