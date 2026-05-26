import { chromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN Y ESTADO
// ─────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MONITORED_FILE = path.join(PROJECT_ROOT, '.agent', 'monitored_posts.json');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
const LOG_FILE = path.join(PROJECT_ROOT, '.agent', 'playwriter_log.txt');
const REPLIES_FILE = path.join(PROJECT_ROOT, '.agent', 'comment_replies.json');

let CONFIG = {
  selectedAccount: 'braiurato',
  commentKeywords: ['bot', 'trading', 'sistema', 'SISTEMA', 'info', 'bitacora', 'más info', 'mas info', 'información', 'hola', 'Hola', 'interesa', 'quiero', 'detalles'],
  commentPollInterval: 45_000,
  n8nWebhookUrl: 'http://127.0.0.1:5678/webhook/instagram-outreach',
  bridgeUrl: 'http://localhost:5680'
};

const OWN_ACCOUNTS = ['braiurato', 'tradeshare.ok', 'braianraiurato', 'tradeshare', 'braian_raiurato'];
const OUR_REPLY_FRAGMENTS = ['Te enviamos los detalles', 'Te enviamos la información', 'te escribimos por mensaje privado', 'mensaje privado con toda la info'];

let commentReplies = {};

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

async function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  try { await fs.appendFile(LOG_FILE, line + '\n'); } catch {}
}

async function loadMemory() {
  try {
    const rawR = await fs.readFile(REPLIES_FILE, 'utf-8');
    commentReplies = JSON.parse(rawR);
  } catch { commentReplies = {}; }
  
  try {
    const rawC = await fs.readFile(CONFIG_PATH, 'utf-8');
    const full = JSON.parse(rawC);
    CONFIG = { ...CONFIG, ...full };
  } catch {}
}

async function saveMemory() {
  await fs.writeFile(REPLIES_FILE, JSON.stringify(commentReplies, null, 2));
}

async function dismissModals(page) {
  const selectors = ['button:has-text("Ahora no")', 'button:has-text("Not Now")', 'svg[aria-label="Cerrar"]'];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel);
      if (await el.count() > 0) await el.first().click({ timeout: 1000 }).catch(() => {});
    } catch {}
  }
}

// ── Sincronización con Dashboard ──
async function reportProspect(username, postUrl, text) {
    await log(`📡 Reportando prospecto @${username}...`);
    const payload = { username, postUrl, commentText: text, timestamp: new Date().toISOString(), source: 'playwriter-daemon' };
    try { await axios.post(`${CONFIG.bridgeUrl}/prospects/add`, { username }); } catch {}
    try { await axios.post(CONFIG.n8nWebhookUrl, payload); } catch {}
}

// ── Monitoreo de Seguidores ──
async function trackGrowth(page, account) {
    await log(`📈 Monitoreando crecimiento para @${account}...`);
    try {
        await page.goto(`https://www.instagram.com/${account}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        const stats = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span'));
            const getVal = (regex) => {
                const span = spans.find(s => regex.test(s.innerText) && s.innerText.length < 25);
                if (!span) return 0;
                const num = span.innerText.replace(/[^0-9KkM]/g, '').replace(/[Kk]/, '000').replace(/[Mm]/, '000000');
                return parseInt(num) || 0;
            };
            return { followers: getVal(/seguidores|followers/i), following: getVal(/seguidos|following/i) };
        });
        await axios.post(`${CONFIG.bridgeUrl}/instagram-stats/update`, { account, ...stats });
        await log(`✅ Crecimiento @${account}: ${stats.followers} seguidores.`);
    } catch (e) {
        await log(`⚠️ Falló monitoreo de crecimiento @${account}: ${e.message}`, 'WARN');
    }
}

// ─────────────────────────────────────────────────────────────
// ACCIONES
// ─────────────────────────────────────────────────────────────

async function replyToComment(page, postUrl, username, replyText) {
  await log(`💬 Interactuando con @${username}...`);
  try {
    const interaction = await page.evaluate((targetUsername) => {
        const allA = Array.from(document.querySelectorAll('a[href]'));
        const userLink = allA.find(a => a.innerText.toLowerCase() === targetUsername.toLowerCase() || a.innerText.toLowerCase() === `@${targetUsername.toLowerCase()}`);
        if (!userLink) return { ok: false, error: 'User link not found' };

        let container = userLink;
        for (let i = 0; i < 12; i++) {
            container = container.parentElement;
            if (!container) break;
            const likeBtn = container.querySelector('svg[aria-label="Me gusta"], svg[aria-label="Like"]');
            if (likeBtn) (likeBtn.closest('div[role="button"]') || likeBtn.parentElement).click();
            const buttons = Array.from(container.querySelectorAll('span, div[role="button"]'));
            const replyBtn = buttons.find(b => b.innerText === 'Responder' || b.innerText === 'Reply');
            if (replyBtn) { replyBtn.click(); return { ok: true }; }
        }
        return { ok: false, error: 'Reply button not found' };
    }, username);

    if (!interaction.ok) return false;

    await log(`✅ Like y Reply clickeado para @${username}`);
    await page.waitForTimeout(2000);
    await page.keyboard.type(replyText, { delay: 60 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    return true;
  } catch (err) { return false; }
}

async function scanComments(page) {
  await log('🕵️‍♂️ Escaneando comentarios (Hybrid Sync)...');
  await loadMemory();
  const data = JSON.parse(await fs.readFile(MONITORED_FILE, 'utf-8').catch(() => '{"posts":[]}'));
  
  for (const postUrl of (data.posts || [])) {
    await log(`🔎 Revisando post: ${postUrl}`);
    try {
        await page.goto(postUrl.replace(/\/+$/, '') + '/', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(5000);
        await dismissModals(page);
        await page.evaluate(() => window.scrollBy(0, 400));
        await page.waitForTimeout(1500);

        const scanResult = await page.evaluate(({ keywords, author, ownAccounts, replyFragments }) => {
            const results = [];
            const debugAll = [];
            const seen = new Set();
            const EXCLUDE = ['explore', 'reels', 'p', 'direct', 'stories', 'accounts', 'legal', 'privacy', 'help', 'terms', 'about', 'popular', 'api', ...ownAccounts];
            const nav = document.querySelector('nav, div[role="navigation"]');
            
            Array.from(document.querySelectorAll('span[dir="auto"]')).forEach(span => {
                if (nav && nav.contains(span)) return;
                const text = (span.innerText || '').trim();
                if (text.length < 2 || replyFragments.some(f => text.toLowerCase().includes(f.toLowerCase()))) return;

                if (keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) {
                    let container = span.parentElement;
                    let user = null;
                    for (let i = 0; i < 12; i++) {
                        if (!container) break;
                        const links = container.querySelectorAll('a[href]');
                        for (const link of links) {
                            const href = link.getAttribute('href') || '';
                            const parts = href.split('/').filter(p => p.length > 0);
                            if (parts.length === 1 && !EXCLUDE.includes(parts[0].toLowerCase())) {
                                const u = parts[0];
                                // Validar formato de usuario real de Instagram
                                if (/^[a-zA-Z0-9._]+$/.test(u) && u.length > 2) {
                                    user = u; 
                                    break; 
                                }
                            }
                        }
                        if (user) break;
                        container = container.parentElement;
                    }
                    if (user && !seen.has(user) && user.toLowerCase() !== author.toLowerCase()) { seen.add(user); results.push({ user, text }); }
                } else if (text.length > 5) {
                    if (debugAll.length < 10) debugAll.push(text.slice(0, 30));
                }
            });
            return { results, debugAll };
        }, { keywords: CONFIG.commentKeywords, author: CONFIG.selectedAccount, ownAccounts: OWN_ACCOUNTS, replyFragments: OUR_REPLY_FRAGMENTS });

        for (const { user, text } of scanResult.results) {
            const key = `${postUrl}__${user}`;
            if (commentReplies[key]) continue;
            await reportProspect(user, postUrl, text);
            const ok = await replyToComment(page, postUrl, user, '¡Excelente interés! Qué bueno que te guste TradeShare. Te enviamos los detalles por mensaje privado 🚀');
            if (ok) {
                commentReplies[key] = { repliedAt: new Date().toISOString(), text };
                await saveMemory();
                await log(`✅ Respuesta enviada a @${user}`);
            }
        }
    } catch (e) { await log(`⚠️ Error escaneando: ${e.message}`, 'WARN'); }
  }
}

async function main() {
  await log('🚀 Iniciando IG Playwriter Daemon (V5 Pro Sync)...');
  await loadMemory();
  let browser, context;
  const connect = async () => {
    try {
      const cdpUrl = getCdpUrl({ port: 19988 });
      browser = await chromium.connectOverCDP(cdpUrl);
      context = browser.contexts()[0];
      await log('✅ Conectado al relay de Playwriter');
    } catch (e) { await log(`❌ Error conectando: ${e.message}`, 'ERROR'); }
  };
  await connect().catch(() => {});

  let cycleCount = 0;
  while (true) {
    try {
      if (!browser || !browser.isConnected()) await connect();
      await log('🔄 Iniciando ciclo...');
      const pages = context.pages();
      // Buscar una página que tenga la URL de Instagram y que NO sea un modal de creación o publicación
      let page = null;
      for (const p of pages) {
          if (!p.isClosed() && p.url().includes('instagram.com')) {
              // Si la página contiene elementos del modal de subida o creación, la omitimos para no interferir
              const isUploadModal = await p.evaluate(() => {
                  return !!document.querySelector('[role="dialog"]') || 
                         window.location.href.includes('create') ||
                         [...document.querySelectorAll('span, button')].some(el => {
                             const t = el.textContent || '';
                             return t.includes('Compartir') || t.includes('Siguiente') || t.includes('Recortar');
                         });
              }).catch(() => false);
              
              if (!isUploadModal) {
                  page = p;
                  break;
              }
          }
      }
      
      if (!page || page.isClosed()) {
          await log('🆕 Creando pestaña dedicada para monitoreo de comentarios...');
          page = await context.newPage();
          await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 35000 });
          await page.waitForTimeout(3000);
      }
      
      // Asegurar que trabaje de forma oculta en background sin interferir ni robar el foco del usuario
      // (Eliminamos el bringToFront que traía la ventana al frente)
      
      // Cada 5 ciclos, trackear crecimiento
      if (cycleCount % 5 === 0) {
          await trackGrowth(page, CONFIG.selectedAccount);
          await trackGrowth(page, 'tradeshare.ok');
      }

      await scanComments(page);
      cycleCount++;

      await log(`😴 Esperando ${CONFIG.commentPollInterval / 1000}s...`);
      await page.waitForTimeout(CONFIG.commentPollInterval);
    } catch (err) {
      await log(`❌ Error en loop: ${err.message}`, 'ERROR');
      if (err.message.includes('closed') || err.message.includes('connected')) browser = null;
      await new Promise(r => setTimeout(r, 15000));
    }
  }
}

main().catch(err => console.error('💥 Error fatal:', err));
