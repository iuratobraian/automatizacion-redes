import { chromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { ALL_KEYWORDS, printKeywordSummary } from './keywords-master.mjs';

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
  selectedAccount: 'tradeshare.ok',
  // Cargadas desde keywords-master.mjs — NO editar aquí.
  // Editar en keywords-master.mjs para que el cambio se propague a todos los daemons.
  commentKeywords: [...ALL_KEYWORDS],
  commentPollInterval: 90_000,
  n8nWebhookUrl: 'http://127.0.0.1:5678/webhook/instagram-outreach',
  bridgeUrl: 'http://localhost:5680'
};

const OWN_ACCOUNTS = ['tradeshare.ok'];
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

    // Copiar sólo los campos seguros del config (nunca sobreescribir commentKeywords con lista vieja)
    if (full.selectedAccount) CONFIG.selectedAccount = full.selectedAccount;
    if (full.n8nWebhookUrl)   CONFIG.n8nWebhookUrl   = full.n8nWebhookUrl;
    if (full.bridgeUrl)       CONFIG.bridgeUrl        = full.bridgeUrl;
    if (full.commentPollInterval) CONFIG.commentPollInterval = full.commentPollInterval;

    // Combinar keywords: master (base) + tiers del ig-config + lista plana
    const extraKeywords = [];
    const tiers = full?.comment_detection?.tiers;
    if (tiers) {
      for (const tier of Object.values(tiers)) {
        if (Array.isArray(tier.keywords)) extraKeywords.push(...tier.keywords);
      }
    }
    if (Array.isArray(full.commentKeywords)) extraKeywords.push(...full.commentKeywords);
    CONFIG.commentKeywords = [...new Set([...ALL_KEYWORDS, ...extraKeywords])];
  } catch {}

  // Mostrar resumen al iniciar
  printKeywordSummary();
  await log(`🔑 Keywords activas: ${CONFIG.commentKeywords.length} palabras monitoreadas`);
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

async function scanComments(page, currentCycle = 0) {
  await log('🕵️‍♂️ Escaneando comentarios (Hybrid Sync)...');
  await loadMemory();
  const state = JSON.parse(await fs.readFile(MONITORED_FILE, 'utf-8').catch(() => '{"posts":[], "profiles": ["tradeshare.ok"]}'));
  
  // Descubrir posts desde perfiles para monitorear TODO, incluso si hay más de 15 posts
  const discoveredPosts = [];
  const profiles = state.profiles && state.profiles.length > 0 ? state.profiles : ['tradeshare.ok', 'braiurato'];
  
  for (const profile of profiles) {
    try {
      await log(`🔎 Descubriendo posts en el perfil de @${profile}...`);
      await page.goto(`https://www.instagram.com/${profile}/`, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await dismissModals(page);
      await page.waitForTimeout(3000);

      // Hacer scroll para cargar publicaciones antiguas (soporta más de 15 posts)
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
        if (href && href.includes('/p/')) {
          const match = href.match(/\/p\/([A-Za-z0-9_-]{9,15})/);
          if (match) {
            const shortcode = match[1];
            const cleanUrl = `https://www.instagram.com/p/${shortcode}/`;
            if (!discoveredPosts.includes(cleanUrl)) {
              discoveredPosts.push(cleanUrl);
            }
          }
        }
      }
      await log(`🔎 Perfil @${profile}: ${discoveredPosts.length} posts descubiertos en total (ordenados de más nuevo a más viejo)`);
    } catch (e) {
      await log(`⚠️ Error descubriendo posts del perfil @${profile}: ${e.message}`, 'WARN');
    }
  }

  // Combinar posts: los descubiertos en el perfil (ordenados de más nuevo a más viejo) van primero
  const combinedPosts = [...discoveredPosts];
  const filePosts = state.posts || [];
  
  // Agregar en orden inverso los del archivo local (los más nuevos se agregan al final)
  for (let i = filePosts.length - 1; i >= 0; i--) {
    const postUrl = filePosts[i];
    const match = postUrl.match(/\/p\/([A-Za-z0-9_-]{9,15})/);
    if (match) {
      const shortcode = match[1];
      const cleanUrl = `https://www.instagram.com/p/${shortcode}/`;
      if (!combinedPosts.includes(cleanUrl)) {
        combinedPosts.push(cleanUrl);
      }
    }
  }

  // Monitoreo Inteligente para evitar Rate Limits de Instagram
  // Hacemos barrido completo cada 10 ciclos. En ciclos normales sólo escaneamos los 4 posts más recientes.
  const isFullSweep = (currentCycle === 0 || currentCycle % 10 === 0);
  let postsToScan = combinedPosts;
  
  if (!isFullSweep && combinedPosts.length > 4) {
    postsToScan = combinedPosts.slice(0, 4);
    await log(`🛡️ [Rate Limit Shield] Escaneo parcial: analizando solo las 4 publicaciones más recientes (Ciclo ${currentCycle}). Próximo barrido completo en ${10 - (currentCycle % 10)} ciclos.`);
  } else {
    await log(`📊 [Rate Limit Shield] Barrido completo: analizando las ${combinedPosts.length} publicaciones del perfil (Ciclo ${currentCycle}).`);
  }
  
  for (const postUrl of postsToScan) {
    await log(`🔎 Revisando post: ${postUrl}`);
    try {
        const response = await page.goto(postUrl.replace(/\/+$/, '') + '/', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => null);
        const status = response ? response.status() : null;
        
        const isNotFound = status === 404 || status === 410;
        let pageErrorText = false;
        
        if (!isNotFound) {
          pageErrorText = await page.evaluate(() => {
            const txt = document.body ? document.body.innerText : '';
            return txt.includes('Esta página no está disponible') || 
                   txt.includes('The link you followed may be broken') || 
                   txt.includes('Página no encontrada') ||
                   txt.includes('Page Not Found') ||
                   txt.includes('Page not found') ||
                   txt.includes('no está disponible') ||
                   (txt.includes('broken') && txt.includes('link'));
          }).catch(() => false);
        }

        if (isNotFound || pageErrorText) {
          await log(`🚨 Post fallido o eliminado detectado (Status: ${status}): ${postUrl}. Removiendo de monitoreo...`, 'WARN');
          const freshState = JSON.parse(await fs.readFile(MONITORED_FILE, 'utf-8').catch(() => '{"posts":[], "profiles": ["tradeshare.ok"]}'));
          freshState.posts = (freshState.posts || []).filter(p => !p.includes(postUrl) && p !== postUrl);
          await fs.writeFile(MONITORED_FILE, JSON.stringify(freshState, null, 2));
          continue;
        }

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
            await reportProspect(u}

// ─────────────────────────────────────────────────────────────
// TAB MANAGER GLOBAL (Limitador de pestañas y optimización de RAM/CPU)
// ─────────────────────────────────────────────────────────────
class TabManager {
  static MAX_TABS = 4;

  static async cleanOrphanTabs(context) {
    try {
      const pages = context.pages();
      await log(`📊 [Tab Manager] Pestañas abiertas en el contexto: ${pages.length}/${this.MAX_TABS}`);
      
      if (pages.length > this.MAX_TABS) {
        await log(`⚠️ [Tab Manager] Detectadas más pestañas del límite permitido (${pages.length} > ${this.MAX_TABS}). Limpiando pestañas huérfanas o inactivas...`);
        let closedCount = 0;
        for (let i = pages.length - 1; i >= 0; i--) {
          const p = pages[i];
          if (p.isClosed()) continue;
          
          const url = p.url();
          const isPriority = url.includes('instagram.com') || url.includes('threads.net');
          const activePages = context.pages().filter(x => !x.isClosed());
          
          // Mantener al menos 2 pestañas vivas
          if (activePages.length <= 2) break;

          if (!isPriority || url === 'about:blank' || url === '' || (activePages.length > this.MAX_TABS)) {
            await log(`🛡️ [Tab Manager] Cerrando pestaña huérfana/inactiva: ${url.slice(0, 50)}`);
            await p.close().catch(() => {});
            closedCount++;
          }
        }
        await log(`✅ [Tab Manager] Limpieza finalizada. Pestañas cerradas: ${closedCount}. Activas: ${context.pages().length}`);
      }
    } catch (e) {
      await log(`⚠️ [Tab Manager] Error en la limpieza de pestañas: ${e.message}`, 'WARN');
    }
  }

  static async getOrCreateTab(context, targetDomain = 'instagram.com') {
    await this.cleanOrphanTabs(context);
    const pages = context.pages();
    
    // Buscar pestaña existente inactiva con el dominio deseado
    for (const p of pages) {
      if (p.isClosed()) continue;
      const url = p.url();
      if (url.includes(targetDomain)) {
        // Verificar si está libre (no es modal de subida o creación)
        const isUpload = await p.evaluate(() => {
          return !!document.querySelector('[role="dialog"]') || 
                 window.location.href.includes('create') ||
                 [...document.querySelectorAll('span, button')].some(el => {
                     const t = el.textContent || '';
                     return t.includes('Compartir') || t.includes('Siguiente') || t.includes('Recortar');
                 });
        }).catch(() => false);
        
        if (!isUpload) {
          await log(`♻️ [Tab Manager] Reutilizando pestaña activa: ${url.slice(0, 50)}`);
          return p;
        }
      }
    }

    // Si no hay pestañas disponibles, crear una nueva si no excedemos el límite
    const activePages = pages.filter(x => !x.isClosed());
    if (activePages.length >= this.MAX_TABS) {
      await log(`⚠️ [Tab Manager] Límite de pestañas alcanzado (${activePages.length}). Forzando cierre de pestaña no prioritaria...`);
      for (const p of pages) {
        if (!p.isClosed() && !p.url().includes(targetDomain)) {
          await p.close().catch(() => {});
          break;
        }
      }
    }

    await log(`🆕 [Tab Manager] Creando nueva pestaña dedicada para ${targetDomain}...`);
    const newPage = await context.newPage();
    await newPage.goto(`https://www.${targetDomain}/`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await newPage.waitForTimeout(3000);
    return newPage;
  }
}

async function main() {
  await log('🚀 Iniciando IG Playwriter Daemon (V5 Pro Sync)...');
  await loadMemory();
  let browser, context;
  const connect = async () => {
    try {
      const cdpUrl = await getPlaywriterCdpUrl({ port: 19988 });
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
      
      // Utilizar el Tab Manager Global en lugar de abrir infinitas pestañas
      const page = await TabManager.getOrCreateTab(context, 'instagram.com');
      
      // Asegurar que trabaje de forma oculta en background sin interferir ni robar el foco del usuario
      // (Eliminamos el bringToFront que traía la ventana al frente)
      
      // Cada 5 ciclos, trackear crecimiento
      if (cycleCount % 5 === 0) {
          await trackGrowth(page, CONFIG.selectedAccount);
          await trackGrowth(page, 'tradeshare.ok');
      }

      await scanComments(page, cycleCount);
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
