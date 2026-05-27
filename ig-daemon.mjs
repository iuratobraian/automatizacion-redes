import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN Y ESTADO
// ─────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const MONITORED_FILE = path.join(PROJECT_ROOT, ".agent", "monitored_posts.json");
const CONFIG_PATH = path.join(PROJECT_ROOT, ".agent", "ig-config.json");
const LOG_FILE = path.join(PROJECT_ROOT, ".agent", "n8n_log.txt");
const PROCESSED_FILE = path.join(PROJECT_ROOT, ".agent", "processed_interactions.json");
const QUEUE_FILE = path.join(PROJECT_ROOT, ".agent", "dm_queue.json");
const REPLIES_FILE = path.join(PROJECT_ROOT, ".agent", "comment_replies.json");
const PROSPECTS_FILE = path.join(PROJECT_ROOT, ".agent", "prospects.json");

let CONFIG = {
  selectedAccount: "tradeshare.ok",
  sessionFile: path.join(PROJECT_ROOT, ".agent", "instagram_auth_tradeshare.ok.json"),
  commentKeywords: ["bot", "trading", "sistema", "SISTEMA", "info", "INFO", "bitacora", "más info", "mas info", "información", "ia", "IA", "gracias", "la gracias"],
  commentPollInterval: 30_000,
  n8nWebhookUrl: "http://127.0.0.1:5678/webhook/instagram-outreach",
};

const OWN_ACCOUNTS = ["tradeshare.ok"];

let dmQueue = []; 
let commentReplies = {};
let prospects = {};

// ─────────────────────────────────────────────────────────────
// UTILIDADES DE PERSISTENCIA
// ─────────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const full = JSON.parse(raw);
    if (full.commentKeywords) CONFIG.commentKeywords = full.commentKeywords;
    if (full.selectedAccount) CONFIG.selectedAccount = full.selectedAccount;
    if (full.n8nWebhookUrl) CONFIG.n8nWebhookUrl = full.n8nWebhookUrl;
  } catch {}
}

async function loadMemory() {
  try {
    const rawQ = await fs.readFile(QUEUE_FILE, "utf-8");
    dmQueue = JSON.parse(rawQ);
  } catch {
    dmQueue = [];
  }
  try {
    const rawR = await fs.readFile(REPLIES_FILE, "utf-8");
    commentReplies = JSON.parse(rawR);
  } catch {
    commentReplies = {};
  }
  try {
    const rawP = await fs.readFile(PROSPECTS_FILE, "utf-8");
    prospects = JSON.parse(rawP);
  } catch {
    prospects = {};
  }

  // Migración de memoria antigua si existe
  try {
    const raw = await fs.readFile(PROCESSED_FILE, "utf-8");
    const old = JSON.parse(raw);
    if (old.comments) {
      old.comments.forEach(c => {
        const key = `${c.postUrl.replace(/\/+$/, '')}__${c.username}`;
        if (!commentReplies[key]) {
          commentReplies[key] = {
            username: c.username,
            postUrl: c.postUrl,
            commentText: c.text || "(migrado)",
            repliedAt: c.timestamp || new Date().toISOString()
          };
        }
      });
    }
  } catch {}
}

async function saveMemory() {
  try {
    await fs.writeFile(QUEUE_FILE, JSON.stringify(dmQueue, null, 2));
    await fs.writeFile(REPLIES_FILE, JSON.stringify(commentReplies, null, 2));
    await fs.writeFile(PROSPECTS_FILE, JSON.stringify(prospects, null, 2));
  } catch (e) {
    await log(`Error guardando memoria: ${e.message}`, "ERROR");
  }
}

async function updateBitacora(username, action, status, postUrl = "") {
  try {
    const bitacoraPath = path.join(PROJECT_ROOT, "TASK_BITACORA.md");
    const date = new Date().toISOString().split('T')[0];
    const newEntry = `| ${date} | @${username} | ${action} | ${status} | ${postUrl.slice(-15)} |\n`;
    await fs.appendFile(bitacoraPath, newEntry);
  } catch (e) {}
}

async function log(msg, level = "INFO") {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  try { await fs.appendFile(LOG_FILE, line + "\n"); } catch {}
}

async function dismissBridgesAndModals(page) {
  try {
    const selectors = [
      'button:has-text("Ahora no")', 
      '[role="button"]:has-text("Ahora no")', 
      'button:has-text("Not Now")', 
      'button:has-text("Cancelar")',
      'button:has-text("Cancel")',
      'svg[aria-label="Cerrar"]',
      'button:has-text("Discard")'
    ];
    for (const sel of selectors) {
      const el = page.locator(sel);
      if (await el.count() > 0) {
        await el.first().click({ timeout: 2000 }).catch(() => {});
      }
    }
    const supportPopup = page.locator('span:has-text("Looking for support?"), h2:has-text("Enviar comentarios")');
    if (await supportPopup.count() > 0) {
      await page.keyboard.press("Escape");
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// INTEGRACIÓN CON N8N
// ─────────────────────────────────────────────────────────────

async function generateDMWithN8N(username, commentText, keyword) {
  try {
    const response = await fetch(CONFIG.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        message: commentText,
        keyword,
        sender: CONFIG.selectedAccount,
        type: 'pro_outreach'
      })
    });
    const data = await response.json();
    return data.reply || null;
  } catch (e) {
    await log(`Error llamando a n8n: ${e.message}`, "ERROR");
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESAMIENTO DE COMENTARIOS
// ─────────────────────────────────────────────────────────────

async function wasCommentReplied(postUrl, username) {
  const key = `${postUrl.replace(/\/+$/, '')}__${username}`;
  return !!commentReplies[key];
}

async function markCommentReplied(postUrl, username, commentText, ourReply) {
  const key = `${postUrl.replace(/\/+$/, '')}__${username}`;
  commentReplies[key] = {
    username,
    postUrl,
    commentText,
    ourReply,
    repliedAt: new Date().toISOString()
  };
  await saveMemory();
}

async function replyToComment(page, postUrl, username, replyText) {
  try {
    // ── Paso 1: ir a la página de comentarios del post ──
    // Asegurar que no duplicamos /comments/
    let commentsUrl = postUrl.replace(/\/+$/, '');
    if (!commentsUrl.endsWith('/comments')) {
      commentsUrl += '/comments/';
    } else {
      commentsUrl += '/';
    }

    await page.goto(commentsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await dismissBridgesAndModals(page);
    await page.waitForTimeout(2500);

    // ── Paso 2: encontrar el botón "Responder" del comentario correcto ──
    // En la pantalla se ve: username + texto + "2h · Responder"
    // "Responder" es un span con ese texto exacto, dentro del mismo bloque del comentario.

    const clicked = await page.evaluate((targetUsername) => {
      // Buscar todos los spans/elementos con texto exacto "Responder"
      const allElements = Array.from(document.querySelectorAll('*'));
      const responderEls = allElements.filter(el =>
        el.children.length === 0 &&  // nodo hoja (sin hijos)
        (el.textContent || '').trim() === 'Responder'
      );

      for (const btn of responderEls) {
        // Subir hasta 8 niveles buscando si este "Responder"
        // pertenece al comentario de targetUsername
        let node = btn;
        for (let i = 0; i < 8; i++) {
          node = node.parentElement;
          if (!node) break;
          const text = node.innerText || '';
          if (text.includes(targetUsername)) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    }, username);

    if (!clicked) {
      await log(`⚠️ No se encontró "Responder" para @${username}`, 'WARN');
      // Screenshot para debug
      await page.screenshot({
        path: path.join(PROJECT_ROOT, '.agent', `debug-reply-${username}-${Date.now()}.png`)
      });
      return false;
    }

    await page.waitForTimeout(1500);

    // ── Paso 3: escribir la respuesta y enviar ──
    // Al hacer click en "Responder", Instagram suele enfocar automáticamente
    // el input con "@username " ya escrito. Escribimos directamente.
    await page.keyboard.type(replyText, { delay: 45 });
    await page.waitForTimeout(1500);

    // Intentar hacer clic en el botón "Publicar" / "Post" primero (más confiable que Enter)
    const postBtnClicked = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('*'));
      const postBtn = candidates.find(el =>
        el.children.length === 0 &&
        ['Publicar', 'Post', 'Enviar', 'Send'].includes((el.textContent || '').trim())
      );
      if (postBtn) {
        postBtn.click();
        return true;
      }
      return false;
    });

    if (!postBtnClicked) {
      // Fallback: usar Enter si no encontramos el botón
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(2500);
    await log(`💬 Comentario respondido: @${username} en ${postUrl.slice(-20)}`);
    return true;

  } catch (err) {
    await log(`Error respondiendo comentario @${username}: ${err.message}`, 'ERROR');
    await page.screenshot({
      path: path.join(PROJECT_ROOT, '.agent', `debug-reply-err-${username}-${Date.now()}.png`)
    });
    return false;
  }
}

async function scanPosts(page) {
  await log("🕵️‍♂️ Escaneando posts para detectar comentarios nuevos...");
  const state = JSON.parse(await fs.readFile(MONITORED_FILE, "utf-8").catch(() => '{"posts":[], "profiles": []}'));
  
  // Descubrir posts desde perfiles
  const discoveredPosts = [];
  if (state.profiles && state.profiles.length > 0) {
    for (const profile of state.profiles) {
      try {
        await log(`🔎 Buscando posts en el perfil de @${profile}...`);
        await page.goto(`https://www.instagram.com/${profile}/`, { waitUntil: "load", timeout: 45000 });
        await dismissBridgesAndModals(page);
        await page.waitForTimeout(3000);

        // Hacer scroll para cargar publicaciones antiguas (soporta más de 12 posts)
        await log("📜 Haciendo scroll en el perfil para cargar publicaciones antiguas...");
        for (let s = 0; s < 4; s++) {
          await page.evaluate(() => window.scrollBy(0, 1000));
          await page.waitForTimeout(1500);
        }
        await page.evaluate(() => window.scrollTo(0, 0)); // Volver arriba
        await page.waitForTimeout(1000);

        // Esperar que la grilla de posts cargue
        await page.waitForSelector('a[href*="/p/"]', { timeout: 10000 }).catch(() => {});

        const allLinks = await page.$$('a[href*="/p/"]');
        for (const link of allLinks) {
          const href = await link.getAttribute('href');
          if (href && /^\/p\/[A-Za-z0-9_-]{9,15}\/?$/.test(href)) {
            const fullUrl = `https://www.instagram.com${href}`;
            if (!discoveredPosts.includes(fullUrl)) {
              discoveredPosts.push(fullUrl);
            }
          }
        }
        await log(`🔎 Perfil @${profile}: ${discoveredPosts.length} posts descubiertos en total`);
      } catch (e) {
        await log(`Error escaneando perfil @${profile}: ${e.message}`, "WARN");
      }
    }
  }

  // Combinar posts: los descubiertos en el perfil (ordenados de más nuevo a más viejo) van primero
  const combinedPosts = [...discoveredPosts];
  const filePosts = state.posts || [];
  
  // Agregar en orden inverso los del archivo local (los más nuevos se agregan al final)
  for (let i = filePosts.length - 1; i >= 0; i--) {
    const postUrl = filePosts[i];
    if (!combinedPosts.includes(postUrl)) {
      combinedPosts.push(postUrl);
    }
  }

  let postsToScan = combinedPosts;
  await log(`📊 Total de posts únicos a escanear: ${postsToScan.length} (orden prioritario: del más nuevo al más viejo)`);

  for (const postUrl of postsToScan) {
    try {
      // Normalizar a formato corto /p/SHORTCODE/comments/ para entrada directa
      const match = postUrl.match(/\/p\/([A-Za-z0-9_-]+)/);
      if (!match) continue;
      const shortcode = match[1];
      const cleanUrl = `https://www.instagram.com/p/${shortcode}/comments/`;
      
      await log(`🚀 Navegando directo a comentarios: ${cleanUrl}`);
      await page.goto(cleanUrl, { waitUntil: "load", timeout: 60_000 });
      await dismissBridgesAndModals(page);
      await page.waitForTimeout(4000);

      // Scroll y expansión de comentarios (Surgical Fix)
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(2000);

      const verTodos = page.locator('span, a, [role="button"]').filter({
        hasText: /Ver \d+ comentario/
      }).first();
      try {
        if (await verTodos.count() > 0) {
          await verTodos.click({ timeout: 3000 });
          await page.waitForTimeout(2000);
          
          const verMas = page.locator('span, a, [role="button"]').filter({
            hasText: /Ver \d+ comentario|Ver más comentarios|Load more/
          }).first();
          if (await verMas.count() > 0) {
            await verMas.click({ timeout: 2000 });
            await page.waitForTimeout(1500);
          }
        }
      } catch {}

      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(1000);

      // BUG 3 FIX: Refactor de extracción de comentarios
      const comments = await page.evaluate(({ keywords, author, exclude }) => {
        const results = [];
        const seen = new Set();
        
        // En Instagram mobile los comentarios son span[dir="auto"]
        const textSpans = document.querySelectorAll('span[dir="auto"]');
        
        for (const span of textSpans) {
          const text = (span.textContent || '').trim();
          
          if (!text || text.length < 2) continue;
          const esUI = ['Responder', 'Reply', 'Me gusta', 'Like', 'Ver respuestas',
            'View replies', 'Ver más', 'See more', 'Siguiendo', 'Seguir'].some(ui => text === ui);
          if (esUI) continue;
          if (/^\d+[smhdw]$/.test(text)) continue;
          if (/^\d+$/.test(text)) continue;

          let username = null;
          let node = span.parentElement;
          for (let i = 0; i < 6; i++) {
            if (!node) break;
            const links = node.querySelectorAll('a[href]');
            for (const link of links) {
              const href = (link.getAttribute('href') || '');
              const match = href.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
              if (!match) continue;
              const u = match[1];
              const excluir = ['explore','reels','direct','stories','accounts',
                'legal','about','privacy','p','reel','tv','trending'];
              if (excluir.includes(u)) continue;
              username = u;
              break;
            }
            if (username) break;
            node = node.parentElement;
          }

          if (username && !seen.has(username) && username !== author.toLowerCase() && !exclude.includes(username)) {
            // Verificar si el texto del comentario contiene alguna keyword
            if (keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) {
              const foundKeyword = keywords.find(k => text.toLowerCase().includes(k.toLowerCase()));
              seen.add(username);
              results.push({ username, text, keyword: foundKeyword });
            }
          }
        }
        return results;
      }, { keywords: CONFIG.commentKeywords, author: CONFIG.selectedAccount, exclude: OWN_ACCOUNTS });

      await log(`📋 Post ${cleanUrl.slice(-20)}: ${comments.length} comentarios detectados`);

      // DEBUG: Si sigue en 0, guardar screenshot
      if (comments.length === 0) {
        const screenshotPath = path.join(PROJECT_ROOT, '.agent', `debug-comments-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await log(`📸 Screenshot guardado en ${screenshotPath} para debug`, 'WARN');
      }

      for (const { username, text, keyword } of comments) {
        // 1. Verificar si YA RESPONDIMOS a este comentario específico (Deduplicación de Comentario)
        if (await wasCommentReplied(cleanUrl, username)) continue;

        await log(`🎯 Respondiendo comentario de @${username}...`);
        const commentReplyText = `¡Excelente! Te escribimos por privado con la invitación. 🚀`;
        const replied = await replyToComment(page, cleanUrl, username, commentReplyText);
        
        if (replied) {
          // Marcar como respondido inmediatamente para no repetir en el próximo ciclo
          await markCommentReplied(cleanUrl, username, text, commentReplyText);
          await updateBitacora(username, "Comentario", "✅ OK", cleanUrl);

          // 2. Lógica de DM (Separada): Solo encolar si no hay DM reciente o pendiente
          const existingProspect = prospects[username];
          let skipDM = false;

          if (existingProspect) {
            if (existingProspect.status === 'dm_pendiente') {
              await log(`⏭️ Saltando DM para @${username}: Ya tiene uno en cola.`);
              skipDM = true;
            } else if (existingProspect.status === 'dm_enviado') {
              const lastSent = new Date(existingProspect.dmSentAt || existingProspect.updatedAt).getTime();
              if (Date.now() - lastSent < 7 * 24 * 60 * 60 * 1000) {
                await log(`⏭️ Saltando DM para @${username}: Enviado recientemente (< 7 días).`);
                skipDM = true;
              }
            }
          }

          if (!skipDM) {
            await log(`📧 Programando DM para @${username}...`);
            const dmMessage = await generateDMWithN8N(username, text, keyword);
            const finalMessage = dmMessage || `¡Hola @${username}! 👋 Vimos tu interés en TradeShare. Acá tenés el acceso al portal y las herramientas de trading: https://www.trade-share.com. ¡Cualquier duda avisanos! 🚀`;

            const scheduledFor = new Date(Date.now() + (Math.floor(Math.random() * 3) + 2) * 60 * 1000).toISOString();
            dmQueue.push({
              id: `q_${Date.now()}`,
              username,
              postUrl: cleanUrl,
              commentText: text,
              keyword,
              message: finalMessage,
              status: "pending",
              scheduledFor,
              createdAt: new Date().toISOString(),
              attempts: 0
            });

            prospects[username] = {
              username, status: "dm_pendiente", firstContactAt: existingProspect ? existingProspect.firstContactAt : new Date().toISOString(),
              updatedAt: new Date().toISOString(), interactions: (existingProspect ? existingProspect.interactions || 0 : 0) + 1,
              postUrl: cleanUrl, commentText: text, keyword, commentReplied: true, dmMessage: finalMessage, scheduledFor, dmSentAt: null, dmAttempts: 0
            };
            await saveMemory();
          }
        }
      }
    } catch (e) {
      await log(`Error en post ${postUrl.slice(-10)}: ${e.message}`, "WARN");
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESAMIENTO DE DMS
// ─────────────────────────────────────────────────────────────

async function sendProspectionDM(browserContext, username, message) {
  const page = await browserContext.newPage();
  try {
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    await dismissBridgesAndModals(page);

    const newMsgSelectors = [
      'svg[aria-label="Nuevo mensaje"]',
      'svg[aria-label="New message"]',
      'a[href="/direct/new/"]',
      '[role="link"][href*="direct/new"]'
    ];
    let clicked = false;
    for (const sel of newMsgSelectors) {
      try {
        await page.click(sel, { timeout: 3000 });
        clicked = true;
        break;
      } catch {}
    }
    if (!clicked) {
      await page.goto('https://www.instagram.com/direct/new/', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForTimeout(2000);

    const searchBox = await page.waitForSelector(
      'input[name="queryBox"], input[placeholder*="Buscar"], input[placeholder*="Search"]',
      { timeout: 8000 }
    );
    await searchBox.fill(username);
    await page.waitForTimeout(2500);

    const selected = await page.evaluate((uname) => {
      const buttons = Array.from(document.querySelectorAll('div[role="button"], [role="option"]'));
      for (const btn of buttons) {
        if (btn.innerText && btn.innerText.toLowerCase().includes(uname.toLowerCase())) {
          btn.click();
          return true;
        }
      }
      const spans = Array.from(document.querySelectorAll('span'));
      for (const span of spans) {
        if (span.innerText.trim() === uname) {
          span.closest('[role="button"]')?.click();
          return true;
        }
      }
      return false;
    }, username);

    if (!selected) {
      await log(`No se encontró resultado para @${username} en búsqueda de DM`, 'WARN');
      return false;
    }
    await page.waitForTimeout(2000);

    const nextSelectors = [
      'button:has-text("Siguiente")',
      'button:has-text("Next")',
      'button:has-text("Chat")',
      '[role="button"]:has-text("Siguiente")'
    ];
    for (const sel of nextSelectors) {
      try {
        await page.click(sel, { timeout: 3000 });
        break;
      } catch {}
    }
    await page.waitForTimeout(2000);

    const textbox = page.locator('div[role="textbox"], [contenteditable="true"], textarea').first();
    await textbox.waitFor({ state: 'visible', timeout: 10000 });
    await textbox.click();
    await page.keyboard.type(message, { delay: 35 });
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');

    await log(`✅ DM enviado a @${username}`);
    await page.waitForTimeout(2000);
    return true;
  } catch (err) {
    await log(`Error enviando DM a @${username}: ${err.message}`, 'ERROR');
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

async function dmQueueLoop(context) {
  const now = new Date();
  const pending = dmQueue.filter(item => item.status === 'pending' && new Date(item.scheduledFor) <= now);
  
  if (pending.length === 0) return;
  
  await log(`📧 Procesando cola de DMs (${pending.length} listos para enviar)...`);
  
  for (const item of pending) {
    const success = await sendProspectionDM(context, item.username, item.message);
    if (success) {
      item.status = "sent";
      item.sentAt = new Date().toISOString();
      if (prospects[item.username]) {
        prospects[item.username].status = "dm_enviado";
        prospects[item.username].dmSentAt = item.sentAt;
        prospects[item.username].updatedAt = item.sentAt;
        prospects[item.username].dmAttempts++;
      }
    } else {
      item.attempts++;
      if (item.attempts > 3) item.status = "failed";
    }
    await saveMemory();
  }
  dmQueue = dmQueue.filter(item => item.status === 'pending' || (item.status === 'failed' && item.attempts <= 3));
  await saveMemory();
}

// ─────────────────────────────────────────────────────────────
// LOOP PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function masterLoop() {
  await log("🚀 TradeShare Daemon (VISUAL + SURGICAL FIX) Iniciando...");
  await loadConfig();
  await loadMemory();
  const session = JSON.parse(await fs.readFile(CONFIG.sessionFile, "utf-8"));
  const browser = await chromium.launch({ headless: false, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    storageState: session,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    locale: "es-AR"
  });
  const page = await context.newPage();

  while (true) {
    try {
      await page.goto("https://www.instagram.com/direct/inbox/", { waitUntil: "load", timeout: 45_000 });
      await dismissBridgesAndModals(page);
      await page.waitForTimeout(5000);
      
      const unread = await page.$$('div[role="listitem"]:has(span[aria-label*="no leído"]), div[role="listitem"]:has(span[aria-label*="unread"])');
      if (unread.length > 0) {
        await unread[0].click();
        await page.waitForTimeout(4000);
        await page.keyboard.type("¡Hola! Gracias por escribir. En breve te contactamos. Mirá TradeShare: https://www.trade-share.com", { delay: 40 });
        await page.keyboard.press("Enter");
      }
      
      await scanPosts(page);
      await dmQueueLoop(context);
      
      await log("😴 Ciclo completo. Esperando 60s...");
      await new Promise(r => setTimeout(r, 60_000));
    } catch (e) {
      await log(`Error Maestro: ${e.message}`, "ERROR");
      await page.goto("https://www.instagram.com/");
      await page.waitForTimeout(10000);
    }
  }
}

masterLoop().catch(e => console.error("💥 Error Fatal:", e));
