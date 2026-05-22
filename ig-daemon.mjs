/**
 * ig-daemon.mjs — TradeShare Instagram Active Listener
 * Maneja DMs entrantes y escaneo de comentarios en tiempo real.
 *
 * DISEÑO CRÍTICO:
 *  - Los DMs se responden directamente en la ventana de chat activa (sin invocar scripts externos).
 *  - Los comentarios se responden en el post y luego se abre el chat privado para el DM de prospección.
 *  - Toda la generación de texto la hace n8n (IA), el daemon solo es el "brazo" de Playwright.
 */

import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const CONFIG = {
  // Cuenta a operar (debe coincidir con el archivo de sesión)
  selectedAccount: process.env.IG_ACCOUNT || "braiurato",

  // Ruta al archivo de sesión de Playwright
  sessionFile: path.join(
    PROJECT_ROOT,
    ".agent",
    `instagram_auth_${process.env.IG_ACCOUNT || "braiurato"}.json`
  ),

  // URL del webhook unificado de n8n
  n8nOutreachWebhook: "http://127.0.0.1:5678/webhook/instagram-outreach",

  // Intervalos de polling (ms)
  dmPollInterval: 15_000,       // 15 seg entre revisiones de DMs
  commentPollInterval: 45_000,  // 45 seg entre escaneos de comentarios

  // Palabras clave que activan respuesta en comentarios
  commentKeywords: [
    "bot", "trading", "invertir", "ganancias", "cómo funciona", "información",
    "interesado", "quiero", "aprende", "señales", "cripto", "forex",
    "donde", "dónde", "más info", "mas info", "how", "interest", "bitacora", "bitácora",
  ],

  // Palabras clave específicas por post (cargadas dinámicamente)
  postKeywords: {},

  // IDs de posts propios a monitorear (base inicial — se complementa con .agent/monitored_posts.json)
  monitoredPostUrls: process.env.MONITORED_POSTS
    ? process.env.MONITORED_POSTS.split(",")
    : [],

  // Log file
  logFile: path.join(PROJECT_ROOT, ".agent", "n8n_log.txt"),

  // Timeout para respuestas de n8n (ms)
  n8nTimeout: 12_000,

  // Máx reintentos antes de saltear un prospecto
  maxRetries: 2,
};

// Carga configuración dinámica en caliente desde .agent/ig-config.json
async function loadConfig() {
  try {
    const configPath = path.join(PROJECT_ROOT, ".agent", "ig-config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.commentKeywords && Array.isArray(parsed.commentKeywords)) {
      CONFIG.commentKeywords = parsed.commentKeywords;
    }
    if (parsed.postKeywords && typeof parsed.postKeywords === "object") {
      CONFIG.postKeywords = parsed.postKeywords;
    }
    if (parsed.selectedAccount) {
      CONFIG.selectedAccount = parsed.selectedAccount;
    }
  } catch (err) {
    // Silencioso
  }
}

// ─────────────────────────────────────────────────────────────
// ARCHIVO DE POSTS Y PERFILES MONITOREADOS
// .agent/monitored_posts.json → { posts: [...], profiles: [...] }
// El publisher agrega automáticamente cada post nuevo aquí.
// ─────────────────────────────────────────────────────────────
const MONITORED_FILE = path.join(PROJECT_ROOT, ".agent", "monitored_posts.json");

async function loadMonitoredState() {
  try {
    const raw = await fs.readFile(MONITORED_FILE, "utf-8");
    const data = JSON.parse(raw);
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      profiles: Array.isArray(data.profiles) ? data.profiles : [CONFIG.selectedAccount],
    };
  } catch {
    return { posts: [], profiles: [CONFIG.selectedAccount] };
  }
}

async function addMonitoredPost(url) {
  const state = await loadMonitoredState();
  const normalized = url.replace(/\/+$/, "") + "/";
  const alreadyIn = state.posts.some(p => p.replace(/\/+$/, "/") === normalized);
  if (!alreadyIn) {
    state.posts.push(normalized);
    await fs.writeFile(MONITORED_FILE, JSON.stringify(state, null, 2));
    await log(`📌 Nuevo post registrado para monitoreo: ${normalized}`);
  }
}

// Archivo para gestionar la cola de prospectos y sus estados (dm_enviado, respondió, en_seguimiento)
const PROSPECTS_FILE = path.join(PROJECT_ROOT, ".agent", "prospects.json");

async function loadProspects() {
  try {
    const content = await fs.readFile(PROSPECTS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveProspects(data) {
  try {
    // Asegurar que el directorio .agent existe
    await fs.mkdir(path.dirname(PROSPECTS_FILE), { recursive: true }).catch(() => {});
    await fs.writeFile(PROSPECTS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    await log(`Error guardando prospects: ${err.message}`, "ERROR");
  }
}

async function updateProspectStatus(username, status, lastMessage = null) {
  const prospects = await loadProspects();
  if (!prospects[username]) {
    prospects[username] = {
      username,
      status: status || "dm_enviado",
      firstContactAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      interactions: 1,
      lastProcessedMessage: lastMessage
    };
  } else {
    if (status) prospects[username].status = status;
    if (lastMessage) prospects[username].lastProcessedMessage = lastMessage;
    prospects[username].updatedAt = new Date().toISOString();
    prospects[username].interactions = (prospects[username].interactions || 1) + 1;
  }
  await saveProspects(prospects);
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

async function log(msg, level = "INFO") {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  try {
    await fs.appendFile(CONFIG.logFile, line + "\n");
  } catch {
    // Si no puede escribir el log, continúa igual
  }
}

/** Pausa aleatoria para simular comportamiento humano */
function humanDelay(minMs = 800, maxMs = 2200) {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Detecta y cierra diálogos bloqueantes de Instagram (guardar inicio de sesión, notificaciones, etc.).
 */
async function dismissBridgesAndModals(page) {
  try {
    // Buscar botones de "Ahora no" o "Not Now" o "Cancelar"
    const dismissButton = page.locator(
      'button:has-text("Ahora no"), [role="button"]:has-text("Ahora no"), ' +
      'button:has-text("Not Now"), [role="button"]:has-text("Not Now"), ' +
      'button:has-text("Cancelar"), button:has-text("Cancel")'
    );
    
    const count = await dismissButton.count();
    if (count > 0) {
      await log(`Descartando ${count} diálogo(s) emergente(s)...`);
      for (let i = 0; i < count; i++) {
        await dismissButton.nth(i).click().catch(() => {});
      }
      await humanDelay(600, 1200);
    }
  } catch (err) {
    // Silencioso
  }
}

/**
 * Llama al webhook unificado de n8n y retorna la respuesta generada por IA.
 * @param {string} username  - Usuario de Instagram (sin @)
 * @param {string} message   - Texto del mensaje/comentario recibido
 * @param {string} type      - "dm" | "comment"
 * @returns {Promise<string|null>} - Texto de reply o null si falla
 */
async function askN8nForReply(username, message, type) {
  const payload = {
    username,
    message,
    sender: CONFIG.selectedAccount,
    type, // "dm" o "comment" — el Router de n8n decide el prompt
  };

  await log(`→ n8n [${type}] para @${username}: "${message.slice(0, 60)}..."`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.n8nTimeout);

  try {
    const res = await fetch(CONFIG.n8nOutreachWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      await log(`n8n respondió HTTP ${res.status}`, "WARN");
      return null;
    }

    const data = await res.json();

    if (!data?.reply || typeof data.reply !== "string") {
      await log(`n8n no retornó campo 'reply' válido: ${JSON.stringify(data)}`, "WARN");
      return null;
    }

    await log(`← n8n reply [${type}]: "${data.reply.slice(0, 80)}"`);
    return data.reply.trim();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      await log(`n8n tardó más de ${CONFIG.n8nTimeout}ms — timeout`, "WARN");
    } else {
      await log(`Error llamando n8n: ${err.message}`, "ERROR");
    }
    return null;
  }
}

/** Escribe texto en un textbox visible de Playwright y envía */
async function typeAndSend(page, selector, text) {
  const box = await page.waitForSelector(selector, { timeout: 8_000 });
  await box.click();
  await humanDelay(300, 700);
  await box.fill(""); // limpiar por si había texto previo
  await humanDelay(200, 400);
  // Simular tipeo humano carácter a carácter
  await page.keyboard.type(text, { delay: 40 });
  await humanDelay(500, 1000);
  await page.keyboard.press("Enter");
  await humanDelay(600, 1200);
}

// ─────────────────────────────────────────────────────────────
// TAREA 1 — MÓDULO DE DMs
// Revisa mensajes no leídos, llama a n8n y responde en el chat activo.
// NUNCA invoca scripts externos ni dispara /send-dm.
// ─────────────────────────────────────────────────────────────

/** Conjunto de usuarios ya procesados en esta sesión (evita responder 2 veces) */
const processedDmUsers = new Set();

/**
 * Bucle principal de DMs.
 * Abre Instagram en la bandeja de entrada y monitorea mensajes no leídos.
 */
async function dmLoop(page) {
  await log("📬 Iniciando bucle de DMs...");

  while (true) {
    try {
      await loadConfig().catch(() => {});
      await page.goto("https://www.instagram.com/direct/inbox/", {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await dismissBridgesAndModals(page);
      await humanDelay(1500, 2500);

      // Seleccionar conversaciones con punto de no leído
      const unreadThreads = await page.$$(
        'div[role="listitem"]:has(span[aria-label*="no leído"]), ' +
        'div[role="listitem"]:has(span[aria-label*="unread"])'
      );

      await log(`📬 DMs no leídos encontrados: ${unreadThreads.length}`);

      for (const thread of unreadThreads) {
        let currentProspect = null;
        try {
          // Extraer nombre de usuario del hilo
          const usernameEl = await thread.$('a[href*="/direct/t/"]');
          if (!usernameEl) continue;

          const href = await usernameEl.getAttribute("href");
          // href puede ser /direct/t/THREAD_ID/ — necesitamos el nombre visible
          const nameEl = await thread.$("span.x1lliihq"); // clase típica de nombre en IG
          currentProspect = nameEl
            ? (await nameEl.innerText()).trim().replace("@", "")
            : null;

          if (!currentProspect) {
            // Fallback: abrir el hilo y leer el nombre desde el header
            await thread.click();
            await humanDelay(1000, 1800);
            const headerName = await page.$eval(
              'header a[href*="/"] span, header h2',
              (el) => el?.textContent?.trim()
            ).catch(() => null);
            currentProspect = headerName?.replace("@", "") || null;
          }

          if (!currentProspect) {
            await log("No se pudo extraer username del hilo, saltando.", "WARN");
            continue;
          }

          if (processedDmUsers.has(currentProspect)) {
            await log(`@${currentProspect} ya fue procesado esta sesión, saltando.`);
            continue;
          }

          // Abrir el hilo si no está ya abierto
          if (!(await page.url().includes("/direct/t/"))) {
            await thread.click();
            await humanDelay(1200, 2000);
          }

          // Leer el último mensaje recibido (el que disparó la notificación)
          const messageEls = await page.$$(
            'div[data-testid="message-container"] span.x193iq5w, ' +
            'div[role="row"] div[dir="auto"]'
          );

          if (messageEls.length === 0) {
            await log(`@${currentProspect}: sin mensajes legibles, saltando.`, "WARN");
            continue;
          }

          const lastMsgText = (
            await messageEls[messageEls.length - 1].innerText()
          ).trim();

          if (!lastMsgText) continue;

          const prospects = await loadProspects();
          if (prospects[currentProspect] && prospects[currentProspect].lastProcessedMessage === lastMsgText) {
            await log(`@${currentProspect} ya procesamos este mensaje ("${lastMsgText.slice(0, 30)}..."). Saltando.`);
            processedDmUsers.add(currentProspect);
            continue;
          }

          await log(`📩 DM de @${currentProspect}: "${lastMsgText.slice(0, 80)}"`);

          // ── Gestionar estado del prospecto en la cola ──
          if (prospects[currentProspect] && prospects[currentProspect].status === "dm_enviado") {
            await log(`📈 @${currentProspect} respondió a nuestra prospección.`);
          }

          // ── Llamar a n8n para generar la respuesta ──
          let reply = null;
          for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
            reply = await askN8nForReply(currentProspect, lastMsgText, "dm");
            if (reply) break;
            await log(`Reintento ${attempt}/${CONFIG.maxRetries} para DM de @${currentProspect}`, "WARN");
            await humanDelay(2000, 3000);
          }

          if (!reply) {
            await log(`No se obtuvo reply de n8n para @${currentProspect}, saltando.`, "WARN");
            continue;
          }

          if (reply === "__IGNORE__") {
            await log(`🤫 @${currentProspect} envió un mensaje de cortesía/agradecimiento. Ignorando respuesta para evitar spam.`);
            await updateProspectStatus(currentProspect, prospects[currentProspect]?.status === "dm_enviado" ? "respondió" : null, lastMsgText);
            processedDmUsers.add(currentProspect);
            continue;
          }

          // ── RESPONDER EN EL CHAT ACTIVO (sin scripts externos) ──
          // El chat ya está abierto desde el click en el hilo
          await typeAndSend(
            page,
            'div[role="textbox"][aria-label], textarea[placeholder*="Mensaje"]',
            reply
          );

          await updateProspectStatus(currentProspect, prospects[currentProspect]?.status === "dm_enviado" ? "respondió" : null, lastMsgText);
          processedDmUsers.add(currentProspect);
          await log(`✅ DM respondido a @${currentProspect}`);
          await humanDelay(2000, 4000); // pausa entre respuestas para no spamear

        } catch (threadErr) {
          await log(
            `Error procesando hilo${currentProspect ? ` @${currentProspect}` : ""}: ${threadErr.message}`,
            "ERROR"
          );
          // Navegar de vuelta a inbox para el siguiente hilo
          await page.goto("https://www.instagram.com/direct/inbox/", {
            waitUntil: "networkidle",
            timeout: 20_000,
          }).catch(() => {});
          await humanDelay(2000, 3000);
        }
      }
    } catch (loopErr) {
      await log(`Error en bucle DMs: ${loopErr.message}`, "ERROR");
    }

    await log(`⏳ Próxima revisión de DMs en ${CONFIG.dmPollInterval / 1000}s`);
    await new Promise((r) => setTimeout(r, CONFIG.dmPollInterval));
  }
}

// ─────────────────────────────────────────────────────────────
// TAREA 2 — MÓDULO DE COMENTARIOS
// Escanea posts propios, detecta keywords, pide reply a n8n,
// responde el comentario y abre DM de prospección.
// ─────────────────────────────────────────────────────────────

/** Mapa: postUrl → Set de usernames ya respondidos */
const processedCommentUsers = new Map();

/**
 * Verifica si un texto contiene alguna keyword de interés.
 * Soporta keywords generales y específicas por post.
 */
function hasKeyword(text, postUrl) {
  const lower = text.toLowerCase();
  let keywords = CONFIG.commentKeywords;
  
  if (CONFIG.postKeywords && postUrl) {
    const normalizedPost = postUrl.replace(/\/+$/, "").toLowerCase();
    const matchedKey = Object.keys(CONFIG.postKeywords).find(
      k => k.replace(/\/+$/, "").toLowerCase() === normalizedPost
    );
    if (matchedKey && Array.isArray(CONFIG.postKeywords[matchedKey]) && CONFIG.postKeywords[matchedKey].length > 0) {
      keywords = CONFIG.postKeywords[matchedKey];
      log(`📌 Usando keywords específicas para este post [${normalizedPost.slice(-15)}]: ${JSON.stringify(keywords)}`);
    }
  }
  
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Responde un comentario en el post activo.
 * Busca el botón "Responder" bajo el comentario del usuario.
 */
async function replyToComment(page, username, replyText) {
  // Buscar el comentario del usuario en la página actual usando su link de perfil
  const commentEl = await page.$(`a[href*="/${username}/"]`).catch(() => null);

  if (!commentEl) {
    await log(`No se encontró el comentario de @${username} en pantalla`, "WARN");
    return false;
  }

  // Buscar el botón "Responder" relativo al comentario y hacer click directamente en el DOM
  const clicked = await commentEl
    .evaluate((el) => {
      // Subir al contenedor del comentario y buscar el botón Reply
      let node = el;
      for (let i = 0; i < 6; i++) {
        node = node.parentElement;
        if (!node) break;
        const btn = node.querySelector('button[type="button"]');
        if (btn && btn.textContent.toLowerCase().includes("responder")) {
          btn.click();
          return true;
        }
      }
      return false;
    })
    .catch(() => false);

  if (clicked) {
    await humanDelay(600, 1200);
  }

  // El textbox de respuesta de comentario
  await typeAndSend(page, 'textarea[placeholder*="comenta"], form textarea', replyText);
  await log(`💬 Comentario respondido para @${username}: "${replyText.slice(0, 50)}"`);
  return true;
}

/**
 * Programa el envío de un DM de prospección personalizado tras un delay de 2 a 5 minutos.
 * Corre de forma totalmente asíncrona y no-bloqueante usando un tab aislado de Playwright.
 */
async function sendProspectionDM(browserContext, username, commentText) {
  // Delay humano de 2 a 5 minutos (120,000ms a 300,000ms)
  const delayMs = Math.floor(Math.random() * (300000 - 120000) + 120000);
  const delaySec = Math.round(delayMs / 1000);
  
  await log(`⏳ Programando DM de prospección para @${username} con un delay de ${delaySec} segundos...`);
  
  // Ejecutar el delay asíncronamente
  await new Promise((r) => setTimeout(r, delayMs));

  // Cargar estado de la cola de prospectos y verificar duplicados
  const prospects = await loadProspects();
  if (prospects[username]) {
    await log(`🚫 @${username} ya posee un registro en la cola (estado: "${prospects[username].status}"). Evitando DM duplicado.`);
    return;
  }

  await log(`📤 Iniciando proceso de DM de prospección para @${username}...`);

  const dmReply = await askN8nForReply(username, commentText, "dm");
  if (!dmReply) {
    await log(`No se obtuvo reply de prospección para @${username}`, "WARN");
    return;
  }

  if (dmReply === "__IGNORE__") {
    await log(`🤫 Prospección para @${username} ignorada debido a filtro de cortesía/agradecimiento.`);
    return;
  }

  // Abrir una página/tab aislada en el contexto de navegación activo
  const pPage = await browserContext.newPage().catch((err) => {
    log(`Error abriendo pestaña para DM de @${username}: ${err.message}`, "ERROR");
    return null;
  });
  if (!pPage) return;

  try {
    // Navegar al perfil del usuario
    await pPage.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await dismissBridgesAndModals(pPage);
    await humanDelay(1500, 3000);

    // Botón "Mensaje" en el perfil
    const msgBtn = await pPage.$('button:has-text("Mensaje"), a[href*="/direct/"]');
    if (!msgBtn) {
      await log(`No se encontró botón Mensaje en perfil @${username}`, "WARN");
      await pPage.close().catch(() => {});
      return;
    }
    await msgBtn.click();
    await humanDelay(2000, 4000);

    await typeAndSend(
      pPage,
      'div[role="textbox"], textarea[placeholder*="Mensaje"]',
      dmReply
    );

    // Actualizar el estado en el JSON persistente
    await updateProspectStatus(username, "dm_enviado");
    
    // Registrar también en memoria de sesión activa
    processedDmUsers.add(username);
    
    await log(`✅ DM de prospección enviado con éxito a @${username} (Estado actualizado a "dm_enviado").`);
  } catch (err) {
    await log(`Error enviando DM de prospección a @${username}: ${err.message}`, "ERROR");
  } finally {
    await pPage.close().catch(() => {});
  }
}

/**
 * Bucle principal de comentarios.
 * Itera sobre los posts monitoreados y responde comentarios con keywords.
 */
async function commentLoop(page) {
  await log("💬 Iniciando bucle de comentarios...");

  while (true) {
    await loadConfig().catch(() => {});
    let postUrls = [...CONFIG.monitoredPostUrls];

    // Leer estado dinámico desde .agent/monitored_posts.json
    const monitoredState = await loadMonitoredState();
    const profilesToScan = monitoredState.profiles.length > 0
      ? monitoredState.profiles
      : [CONFIG.selectedAccount];

    // Agregar posts fijos del JSON
    for (const p of monitoredState.posts) {
      if (!postUrls.includes(p)) postUrls.push(p);
    }


    // Escaneo dinámico de TODOS los perfiles monitoreados
    for (const profile of profilesToScan) {
      try {
        await page.goto(`https://www.instagram.com/${profile}/`, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        await dismissBridgesAndModals(page);
        await humanDelay(2000, 3500);

        const postLinks = await page.$$('article a[href*="/p/"]');
        const count = Math.min(postLinks.length, 6);
        await log(`🔎 Perfil @${profile}: ${postLinks.length} posts encontrados, analizando los últimos ${count}...`);

        for (let i = 0; i < count; i++) {
          const href = await postLinks[i].getAttribute("href");
          if (href) {
            const absoluteUrl = (href.startsWith("http") ? href : `https://www.instagram.com${href}`)
              .replace(/\/+$/, "") + "/";
            if (!postUrls.includes(absoluteUrl)) {
              postUrls.push(absoluteUrl);
            }
          }
        }
      } catch (profileErr) {
        await log(`⚠️ No se pudieron extraer posts de @${profile}: ${profileErr.message}`, "WARN");
      }
    }


    if (postUrls.length === 0) {
      await log("⚠️ No hay posts fijos ni dinámicos para escanear en esta iteración. Reintentando...", "WARN");
    }

    for (const postUrl of postUrls) {
      try {
        const commentsUrl = postUrl.endsWith("/comments/") 
          ? postUrl 
          : (postUrl.endsWith("/") ? `${postUrl}comments/` : `${postUrl}/comments/`);

        await page.goto(commentsUrl, { waitUntil: "networkidle", timeout: 30_000 });
        await dismissBridgesAndModals(page);
        await humanDelay(1500, 2500);

        if (!processedCommentUsers.has(postUrl)) {
          processedCommentUsers.set(postUrl, new Set());
        }
        const processed = processedCommentUsers.get(postUrl);

        // ── Extraer comentarios reales usando la estructura del DOM de Instagram ──
        // En la página de comentarios, cada comentario es un <li> o <div> que contiene
        // el link del usuario (/@username/) seguido del texto del comentario.
        const comments = await page.evaluate(() => {
          const results = [];

          // Instagram comments structure: each comment has a username link + text span
          // The username links have href like "/username/" (exactly 2 slashes, no subpaths)
          const allLinks = document.querySelectorAll('a[href]');
          for (const link of allLinks) {
            const href = link.getAttribute('href') || '';
            // Solo links de perfil puro: /username/ (no /p/, /reel/, /explore/, etc.)
            const profileMatch = href.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
            if (!profileMatch) continue;
            const username = profileMatch[1];

            // Ignorar links de navegación comunes
            if (['explore', 'reels', 'direct', 'stories', 'accounts', 'legal', 'about', 'privacy'].includes(username)) continue;

            // El texto del comentario está en un span cercano al link (sibling o parent)
            let commentText = null;
            const parent = link.closest('li, [role="listitem"], div[class]') || link.parentElement;
            if (parent) {
              // Buscar spans con texto que no sean el username ni botones
              const spans = parent.querySelectorAll('span[dir="auto"], span');
              for (const span of spans) {
                const text = span.textContent.trim();
                if (
                  text &&
                  text !== username &&
                  !text.startsWith('@') &&
                  !['Responder', 'Reply', 'Me gusta', 'Like', 'Ver respuestas', 'View replies'].some(b => text.includes(b)) &&
                  !/^\d+\s?[smhd]$/.test(text) &&   // no timestamps "2h", "5m", etc.
                  !/^\d+$/.test(text) &&              // no solo números
                  text.length >= 2
                ) {
                  commentText = text;
                  break;
                }
              }
            }

            if (commentText) {
              results.push({ username, text: commentText });
            }
          }

          // Eliminar duplicados de username (quedarse con el primer comentario por usuario)
          const seen = new Set();
          return results.filter(c => {
            if (seen.has(c.username)) return false;
            seen.add(c.username);
            return true;
          });
        });

        await log(`📋 Post ${postUrl.slice(-20)}: ${comments.length} comentarios reales detectados`);


        for (const { username: commentUsername, text: commentText } of comments) {
          try {
            // Ignorar comentarios propios y ya procesados
            if (commentUsername === CONFIG.selectedAccount || commentUsername === "tradeshare.ok") {
              await log(`⚠️ Comentario de cuenta propia (@${commentUsername}) detectado en post ${postUrl.slice(-20)}. Saltando para evitar auto-spam.`);
              continue;
            }
            if (processed.has(commentUsername)) {
              continue;
            }

            if (!hasKeyword(commentText, postUrl)) continue;

            await log(`🎯 Keyword detectada en comentario de @${commentUsername}: "${commentText.slice(0, 60)}"`);

            // ── Pedir a n8n una respuesta corta para el comentario ──
            let commentReply = null;
            for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
              commentReply = await askN8nForReply(commentUsername, commentText, "comment");
              if (commentReply) break;
              await humanDelay(2000, 3000);
            }

            if (!commentReply) {
              await log(`Sin reply de n8n para comentario de @${commentUsername}`, "WARN");
              continue;
            }

            // ── Responder el comentario en el post ──
            await replyToComment(page, commentUsername, commentReply);
            processed.add(commentUsername);
            await humanDelay(2000, 3500);

            // ── Disparar DM de prospección personalizado con delay (Asíncrono y no-bloqueante) ──
            sendProspectionDM(page.context(), commentUsername, commentText).catch((err) => {
              log(`Error en envío asíncrono de DM a @${commentUsername}: ${err.message}`, "ERROR");
            });
            await humanDelay(1500, 3000);

          } catch (commentErr) {
            await log(`Error procesando comentario de @${commentUsername}: ${commentErr.message}`, "ERROR");
          }
        }

      } catch (postErr) {
        await log(`Error escaneando post ${postUrl}: ${postErr.message}`, "ERROR");
      }

      await humanDelay(3000, 5000); // pausa entre posts
    }

    await log(`⏳ Próximo escaneo de comentarios en ${CONFIG.commentPollInterval / 1000}s`);
    await new Promise((r) => setTimeout(r, CONFIG.commentPollInterval));
  }
}

// ─────────────────────────────────────────────────────────────
// ARRANQUE PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function main() {
  await log("🚀 TradeShare IG Daemon iniciando...");

  // Verificar que el archivo de sesión existe
  try {
    await fs.access(CONFIG.sessionFile);
  } catch {
    await log(
      `❌ Archivo de sesión no encontrado: ${CONFIG.sessionFile}\n` +
      "   Ejecutá el script de login para generarlo.",
      "ERROR"
    );
    process.exit(1);
  }

  // Cargar cookies de sesión
  const sessionData = JSON.parse(await fs.readFile(CONFIG.sessionFile, "utf-8"));

  // Lanzar Chromium respetando ig-config.json
  const configPath = path.join(PROJECT_ROOT, ".agent", "ig-config.json");
  let isHeadless = true;
  try {
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);
    if (config.headless !== undefined) isHeadless = config.headless;
  } catch (e) {}

  console.log(`⚙️ Daemon: Iniciando navegador con headless = ${isHeadless}`);

  const browser = await chromium.launch({
    headless: isHeadless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      // Simular iPhone 14 Pro Max para parecerse más al cliente móvil de IG
      "--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    ],
  });

  const context = await browser.newContext({
    storageState: sessionData,
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  });

  // Cada loop corre en su propia pestaña para no interferir
  const dmPage = await context.newPage();
  const commentPage = await context.newPage();

  // Verificar sesión activa
  await dmPage.goto("https://www.instagram.com/", { waitUntil: "networkidle", timeout: 30_000 });
  await dismissBridgesAndModals(dmPage);
  const isLoggedIn = await dmPage.$('a[href="/direct/inbox/"]').then((el) => !!el);

  if (!isLoggedIn) {
    await log(
      "❌ La sesión de Instagram expiró. Regenerá el archivo de cookies.",
      "ERROR"
    );
    await browser.close();
    process.exit(1);
  }

  await log(`✅ Sesión activa como @${CONFIG.selectedAccount}`);

  // Correr ambos bucles en paralelo con manejo de errores independiente
  const loops = [
    dmLoop(dmPage).catch(async (err) => {
      await log(`💥 dmLoop falló fatalmente: ${err.message}`, "ERROR");
    }),
    commentLoop(commentPage).catch(async (err) => {
      await log(`💥 commentLoop falló fatalmente: ${err.message}`, "ERROR");
    }),
  ];

  // Manejo de señales para cierre limpio
  process.on("SIGINT", async () => {
    await log("🛑 SIGINT recibido, cerrando daemon...");
    await browser.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await log("🛑 SIGTERM recibido, cerrando daemon...");
    await browser.close();
    process.exit(0);
  });

  await Promise.allSettled(loops);
  await browser.close();
}

main().catch(async (err) => {
  console.error("💥 Error fatal en main:", err);
  process.exit(1);
});
