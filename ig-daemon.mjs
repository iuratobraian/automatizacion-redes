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

let CONFIG = {
  selectedAccount: "tradeshare.ok",
  sessionFile: path.join(PROJECT_ROOT, ".agent", "instagram_auth_tradeshare.ok.json"),
  commentKeywords: ["bot", "trading", "sistema", "SISTEMA", "info", "bitacora", "más info", "mas info", "información"],
  commentPollInterval: 30_000,
};

let processedInteractions = { comments: [], dms: [] };
let dmQueue = []; 

// ─────────────────────────────────────────────────────────────
// UTILIDADES DE PERSISTENCIA
// ─────────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const full = JSON.parse(raw);
    if (full.commentKeywords) CONFIG.commentKeywords = full.commentKeywords;
    if (full.selectedAccount) CONFIG.selectedAccount = full.selectedAccount;
  } catch {}
}

async function loadMemory() {
  try {
    const raw = await fs.readFile(PROCESSED_FILE, "utf-8");
    processedInteractions = JSON.parse(raw);
  } catch {
    processedInteractions = { comments: [], dms: [] };
  }
  try {
    const rawQ = await fs.readFile(QUEUE_FILE, "utf-8");
    dmQueue = JSON.parse(rawQ);
  } catch {
    dmQueue = [];
  }
}

async function saveMemory() {
  try {
    await fs.writeFile(PROCESSED_FILE, JSON.stringify(processedInteractions, null, 2));
    await fs.writeFile(QUEUE_FILE, JSON.stringify(dmQueue, null, 2));
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
// PROCESAMIENTO DE COMENTARIOS
// ─────────────────────────────────────────────────────────────

async function scanPosts(page) {
  await log("🕵️‍♂️ Escaneando posts para detectar comentarios nuevos...");
  const state = JSON.parse(await fs.readFile(MONITORED_FILE, "utf-8").catch(() => '{"posts":[]}'));
  const posts = state.posts || [];

  for (const postUrl of posts) {
    try {
      const cleanUrl = postUrl.replace(/\/comments\/?$/, "").replace(/\/$/, "");
      await page.goto(cleanUrl + "/", { waitUntil: "load", timeout: 60_000 });
      await dismissBridgesAndModals(page);
      await page.waitForTimeout(4000);

      const bubble = page.locator('svg[aria-label="Comentar"], svg[aria-label="Comment"]').first();
      if (await bubble.count() > 0) {
        await bubble.click();
        await page.waitForTimeout(5000);
      }

      const expand = page.locator('span:has-text("Ver los"), span:has-text("Ver respuestas"), svg[aria-label*="más comentarios"]');
      const expandCount = await expand.count();
      for (let i = 0; i < Math.min(expandCount, 3); i++) {
        await expand.nth(i).click().catch(() => {});
        await page.waitForTimeout(2000);
      }

      const comments = await page.evaluate(({ keywords, author }) => {
        const results = [];
        const elements = Array.from(document.querySelectorAll('span, div[dir="auto"], h3, a'));
        const forbidden = ['reply', 'responder', 'like', 'me gusta', 'more', 'back', 'home', 'explore', 'reels', 'messages', 'volver', 'ver', 'seguir', 'seguidos', 'seguidores', 'perfil', 'editar', 'configuración', 'hace', 'm', 'h', 'd'];
        let lastUser = null;
        for (const el of elements) {
          const text = (el.textContent || '').trim();
          if (el.tagName === 'A' && el.getAttribute('href')?.match(/^\/([A-Za-z0-9._]{1,30})\/?$/)) {
            const user = el.getAttribute('href').replace(/\//g, '').toLowerCase();
            if (user !== author.toLowerCase() && !forbidden.includes(user)) lastUser = user;
            else if (user === author.toLowerCase()) lastUser = null;
            continue;
          }
          if (text.startsWith('@')) continue;
          if (lastUser && keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) {
            results.push({ username: lastUser, text });
            lastUser = null;
          }
        }
        const seen = new Set();
        return results.filter(c => { if (seen.has(c.username)) return false; seen.add(c.username); return true; });
      }, { keywords: CONFIG.commentKeywords, author: CONFIG.selectedAccount });

      for (const { username, text } of comments) {
        if (processedInteractions.comments.some(c => c.username === username && c.postUrl === cleanUrl)) continue;

        await log(`🎯 Respondiendo a @${username}...`);
        const replied = await replyToComment(page, username, `¡Excelente! Te escribimos por privado con la invitación. 🚀`);
        
        if (replied) {
          processedInteractions.comments.push({ postUrl: cleanUrl, username, text, timestamp: new Date().toISOString() });
          if (!dmQueue.includes(username) && !processedInteractions.dms.some(d => d.username === username)) {
            dmQueue.push(username);
          }
          await saveMemory();
          await updateBitacora(username, "Comentario", "✅ OK", cleanUrl);
        }
      }
    } catch (e) {
      await log(`Error en post ${postUrl.slice(-10)}: ${e.message}`, "WARN");
    }
  }
}

async function replyToComment(page, username, replyText) {
  try {
    const commentEl = await page.$(`a[href*="/${username}/"]`);
    if (!commentEl) return false;
    const clicked = await commentEl.evaluate(el => {
      const container = el.closest('li, [role="listitem"], div, section');
      const btn = [...container.querySelectorAll('button, div[role="button"], span')].find(b => {
        const t = (b.textContent || '').toLowerCase();
        return t === 'responder' || t === 'reply';
      });
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) {
      const box = await commentEl.boundingBox();
      if (box) await page.mouse.click(box.x + box.width + 50, box.y + box.height / 2);
    }
    await page.waitForTimeout(3000);
    await page.keyboard.type(replyText, { delay: 50 });
    await page.waitForTimeout(1000);
    await page.keyboard.press("Enter");
    return true;
  } catch (e) { return false; }
}

async function processQueue(page) {
  if (dmQueue.length === 0) return;
  await log(`📧 Procesando cola de DMs (${dmQueue.length} pendientes)...`);
  
  const usersToProcess = [...dmQueue];
  for (const username of usersToProcess) {
    try {
      await log(`👤 Enviando DM a @${username} desde el perfil...`);
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: "load" });
      await dismissBridgesAndModals(page);
      await page.waitForTimeout(4000);

      const msgBtn = page.locator('div[role="button"]:has-text("Mensaje"), button:has-text("Message"), div:has-text("Mensaje")').first();
      if (await msgBtn.count() > 0) {
        await msgBtn.click();
        await page.waitForTimeout(8000);
        const dmText = `¡Hola @${username}! 👋 Vimos tu interés en TradeShare. Acá tenés el acceso al portal y las herramientas de trading: https://www.trade-share.com. ¡Cualquier duda avisanos! 🚀`;
        const chatInput = page.locator('div[role="textbox"], textarea[placeholder*="Mensaje"]').last();
        await chatInput.click();
        await page.keyboard.type(dmText, { delay: 45 });
        await page.waitForTimeout(1500);
        await page.keyboard.press("Enter");
        
        await log(`✅ DM enviado a @${username}`);
        processedInteractions.dms.push({ username, timestamp: new Date().toISOString() });
        dmQueue = dmQueue.filter(u => u !== username); 
        await saveMemory();
        await updateBitacora(username, "Mensaje Privado", "✅ ENVIADO");
        await page.waitForTimeout(5000);
      }
    } catch (e) {
      await log(`Error procesando DM para @${username}: ${e.message}`, "ERROR");
    }
  }
}

async function masterLoop() {
  await log("🚀 TradeShare Daemon (COLA + VISUAL) Iniciando...");
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

  // Capturar logs del navegador para depuración en tiempo real
  page.on('console', msg => {
    if (msg.text().includes('[DAEMON-JS]')) console.log(`🖥️ ${msg.text()}`);
  });

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
      await processQueue(page);
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
