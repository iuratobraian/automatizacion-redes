/**
 * facebook-groups-bot.mjs
 * ══════════════════════════════════════════════════════════
 * Bot de Automatización Autónoma para Grupos de Facebook
 *
 * Flujo:
 *   1. Cargar estado de sesión desde .agent/facebook_auth.json
 *   2. Cargar/inicializar estado en .agent/facebook_groups_state.json
 *   3. Conectar a Playwriter (CDP puerto 19988) o local Chromium de respaldo
 *   4. Seleccionar un grupo de la lista de forma rotativa/aleatoria
 *   5. Crear una publicación de trading invitando a TradeShare (@tradeshare.ok)
 *   6. Escanear posts recientes en el grupo y comentar de 1 a 2 posts con frases
 *      de networking e invitación a TradeShare (@tradeshare.ok)
 *   7. Dormir 3 horas (con Jitter aleatorio) y repetir indefinidamente (PM2 Daemon)
 *
 * Uso:
 *   node facebook-groups-bot.mjs            # Modo Daemon (Corre infinito cada 3 horas)
 *   node facebook-groups-bot.mjs --test     # Ejecuta una sola ronda inmediatamente y termina
 *
 * ══════════════════════════════════════════════════════════
 */

import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { 
  hasCommentedPost, 
  addCommentMade, 
  addPostCreated, 
  hasPostedContent, 
  hasCommentTextBeenUsed,
  isWithinHumanHours 
} from './utils/social-db.mjs';

const PROJECT_ROOT = process.cwd();
const AUTH_FILE = path.join(PROJECT_ROOT, '.agent', 'facebook_auth.json');
const STATE_FILE = path.join(PROJECT_ROOT, '.agent', 'facebook_groups_state.json');

// --- 30 Frases de Publicación Exclusivas (con etiquetado de @tradeshare.ok) ---
const POST_TEMPLATES = [
  "¿Siguen operando solos o ya se sumaron a TradeShare (@tradeshare.ok)? Es gratis y automatiza el registro de setups con IA. ¡Recomendadísimo! 📈",
  "El verdadero problema en el trading no es la estrategia, es la consistencia emocional. Registren sus trades de forma auditada en TradeShare (@tradeshare.ok) y controlen sus sesgos. 🛡️",
  "Discord está muy bien para charlar, pero para trackear métricas de trading reales prefiero TradeShare (@tradeshare.ok). ¿Alguien más lo usa por acá? 📊",
  "Menos humo de capturas de pantalla de MT5 y más track record verificado. Súmense gratis a TradeShare (@tradeshare.ok) y operen en serio. 🚀",
  "¿Seguís gestionando tu academia de trading en canales separados de Telegram y Drive? En TradeShare (@tradeshare.ok) unifican contenido, cursos y TV sin delay en un solo lugar. 🌐",
  "TradingView integrado, bitácora de operaciones y soporte de análisis con IA. Todo en la red social de TradeShare (@tradeshare.ok). ⏱️",
  "Para los traders independientes: dejen de usar Excel aburridos para su journal. TradeShare (@tradeshare.ok) es gratis y automatiza todo. 📈",
  "Un trader rentable piensa en probabilidades, no en certezas. Monitoreen sus ratios de riesgo con el panel de analíticas avanzadas de TradeShare (@tradeshare.ok). 🛡️",
  "¿Qué tal viene el drawdown esta semana? Compartan sus setups y debatan sin ruido en el feed premium de TradeShare (@tradeshare.ok). 📉",
  "Las comunidades de trading están evolucionando hacia ecosistemas profesionales. No se queden atrás y prueben gratis TradeShare (@tradeshare.ok). 🚀",
  "Encontrá analistas técnicos serios de Forex, Crypto e Índices sin spam de bots. Todo en la comunidad especializada de TradeShare (@tradeshare.ok). 📊",
  "La paciencia también es una posición en el mercado. Descubran las herramientas interactivas y conecten con traders fondeados en TradeShare (@tradeshare.ok). ⏱️",
  "¿Alguien tradeando SMC en la killzone de Nueva York? Compartimos setups diariamente en la comunidad VIP de TradeShare (@tradeshare.ok). 🛡️",
  "Dejá de buscar señales mágicas en Telegram. El trading serio se basa en datos. Creá tu bitácora pública auditada en TradeShare (@tradeshare.ok). 📈",
  "Construir marca personal como analista requiere transparencia. Ganá visibilidad publicando tus charts directamente en TradeShare (@tradeshare.ok). 🚀"
];

// --- 20 Frases de Comentarios (Spintax / Variadas) ---
const COMMENT_TEMPLATES = [
  "¡Espectacular setup! 📈 Te invito a compartir tus ideas y ver el feedback de la comunidad en TradeShare (@tradeshare.ok).",
  "Muy buen análisis de mercado. 📊 Justo hoy hablábamos de este patrón en los canales de TradeShare (@tradeshare.ok). ¡Sumate gratis!",
  "Excelente lectura del precio. 🚀 Podés trackear este setup de forma auditada y ver tu progreso gratis en TradeShare (@tradeshare.ok).",
  "¡Qué buen timing! 💡 Si buscás un espacio limpio y sin bots para debatir sobre Forex o Crypto, date una vuelta por TradeShare (@tradeshare.ok).",
  "Totalmente de acuerdo con tu gestión de riesgo. 🛡️ En la plataforma de TradeShare (@tradeshare.ok) premiamos la consistencia real. ¡Te esperamos!",
  "¡Muy de acuerdo con tu análisis técnico! 📉 Súmate a la red exclusiva de TradeShare (@tradeshare.ok) para conectar con otros profesionales.",
  "Buen post. 📈 En TradeShare (@tradeshare.ok) tenemos herramientas gratuitas de análisis con IA para auditar tu bitácora. ¡Éxitos!",
  "¡Interesante perspectiva de trading! 📊 Deberías publicar este setup en TradeShare (@tradeshare.ok), hay un gran nivel de debate técnico.",
  "Gran análisis de la acción del precio. 🚀 Unite gratis a TradeShare (@tradeshare.ok) para compartir y conectar con traders consistentes.",
  "¡Muy claras tus explicaciones! 💡 En TradeShare (@tradeshare.ok) ayudamos a traders a potenciar su marca y reputación. ¡Unite gratis!"
];

// URL de búsqueda de grupos de trading en español latinoamericano
const GROUP_SEARCH_URLS = [
  'https://www.facebook.com/groups/search/groups_home/?q=trading&locale=es_LA',
  'https://www.facebook.com/groups/search/groups_home/?q=forex+trading&locale=es_LA',
  'https://www.facebook.com/groups/search/groups_home/?q=trading+forex+argentina&locale=es_LA',
  'https://www.facebook.com/groups/search/groups_home/?q=trading+criptomonedas&locale=es_LA',
];

// Archivo donde se guardan los grupos descubiertos dinámicamente
const DISCOVERED_GROUPS_FILE = path.join(PROJECT_ROOT, '.agent', 'facebook_discovered_groups.json');

// URLs de grupos de respaldo (usados si el discovery falla)
const FALLBACK_GROUPS = [
  'https://www.facebook.com/groups/forextradersclubhouse/',
  'https://www.facebook.com/groups/tradinglatino/',
  'https://www.facebook.com/groups/criptomonedaslatino/',
  'https://www.facebook.com/groups/forexargentina/',
  'https://www.facebook.com/groups/tradingforexcryptoes/',
  'https://www.facebook.com/groups/mercadoforexlatino/',
];

// Carga grupos descubiertos desde archivo o usa fallback
function loadDiscoveredGroups() {
  try {
    if (fs.existsSync(DISCOVERED_GROUPS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISCOVERED_GROUPS_FILE, 'utf-8'));
      if (Array.isArray(data.groups) && data.groups.length > 0) {
        log(`📚 Cargados ${data.groups.length} grupos descubiertos (última actualización: ${data.updatedAt || 'desconocido'})`);
        return data.groups;
      }
    }
  } catch (e) {
    log(`⚠️ No se pudieron cargar grupos descubiertos: ${e.message}`, 'WARN');
  }
  log(`📋 Usando ${FALLBACK_GROUPS.length} grupos de respaldo predefinidos.`);
  return FALLBACK_GROUPS;
}

// Guarda los grupos descubiertos en archivo
function saveDiscoveredGroups(groups) {
  try {
    const dir = path.dirname(DISCOVERED_GROUPS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISCOVERED_GROUPS_FILE, JSON.stringify({
      groups,
      count: groups.length,
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf-8');
    log(`💾 ${groups.length} grupos guardados en ${DISCOVERED_GROUPS_FILE}`);
  } catch (e) {
    log(`⚠️ No se pudieron guardar grupos descubiertos: ${e.message}`, 'WARN');
  }
}


function log(msg, type = 'INFO') {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${ts}] [FB-GROUPS-BOT] [${type}] ${msg}`);
}

// --- Manejo del Estado del Bot ---
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      return {
        nextGroupIndex: data.nextGroupIndex !== undefined ? data.nextGroupIndex : 0,
        nextPostIndex: data.nextPostIndex !== undefined ? data.nextPostIndex : 0,
        lastRun: data.lastRun || null,
        visitedGroups: data.visitedGroups || {}
      };
    }
  } catch (e) {
    log(`⚠️ No se pudo leer el archivo de estado, iniciando por defecto: ${e.message}`, 'WARN');
  }
  return { nextGroupIndex: 0, nextPostIndex: 0, lastRun: null, visitedGroups: {} };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf-8');
  } catch (e) {
    log(`⚠️ No se pudo guardar el archivo de estado: ${e.message}`, 'WARN');
  }
}

// --- Auto-descubrimiento de grupos de trading desde búsqueda de Facebook ---
async function discoverGroups(page) {
  const discovered = new Set();
  log(`🔍 Iniciando auto-descubrimiento de grupos desde ${GROUP_SEARCH_URLS.length} búsquedas...`);

  for (const searchUrl of GROUP_SEARCH_URLS) {
    try {
      log(`🌐 Navegando a búsqueda: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(5000); // Esperar que cargue el JS dinámico

      // Scroll para cargar más resultados
      for (let s = 0; s < 3; s++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(1500);
      }

      // Extraer todos los links de grupos de la página
      const groupLinks = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a[href]')];
        return links
          .map(a => a.href)
          .filter(href =>
            href.includes('facebook.com/groups/') &&
            !href.includes('/search') &&
            !href.includes('/members') &&
            !href.includes('/media') &&
            !href.includes('/photos') &&
            !href.includes('/events') &&
            !href.includes('/files') &&
            !href.includes('?')
          )
          .map(href => {
            // Normalizar URL: extraer solo la parte base del grupo
            const match = href.match(/(https:\/\/www\.facebook\.com\/groups\/[^/?#]+)/);
            return match ? match[1] + '/' : null;
          })
          .filter(Boolean);
      });

      const before = discovered.size;
      groupLinks.forEach(url => discovered.add(url));
      log(`✅ +${discovered.size - before} grupos nuevos encontrados en esta búsqueda (total: ${discovered.size})`);

    } catch (e) {
      log(`⚠️ Error al buscar grupos en ${searchUrl}: ${e.message}`, 'WARN');
    }
  }

  const result = [...discovered];
  if (result.length > 0) {
    saveDiscoveredGroups(result);
    log(`🎉 Auto-descubrimiento completo: ${result.length} grupos de trading encontrados.`);
  } else {
    log(`⚠️ No se encontraron grupos en la búsqueda. Usando grupos de respaldo.`, 'WARN');
  }
  return result.length > 0 ? result : null;
}

let browser;
let page;
let context;
let isPlaywriter = false;

// Manejo de señales de parada para cerrar ventanas de inmediato
const cleanUpAndExit = async (signal) => {
  log(`⚠️ Señal ${signal} recibida. Forzando cierre de pestañas y navegador...`, "WARN");
  try {
    if (page && typeof page.close === 'function') {
      await page.close().catch(() => {});
    }
  } catch (e) {}
  try {
    if (browser && typeof browser.close === 'function') {
      await browser.close().catch(() => {});
    }
  } catch (e) {}
  log("🏁 Recursos liberados. Saliendo del proceso.");
  process.exit(signal ? 0 : 1);
};

process.on('SIGINT', () => cleanUpAndExit('SIGINT'));
process.on('SIGTERM', () => cleanUpAndExit('SIGTERM'));

// --- Lógica del Daemon ---
async function runBotRound() {
  log("🤖 Iniciando ciclo automático de Facebook Groups Bot...");
  
  if (!isWithinHumanHours()) {
    log("😴 Fuera del horario operativo (08:00 - 23:00). Modo sueño activo. Abortando ronda.");
    return true;
  }

  const state = loadState();
  
  if (!fs.existsSync(AUTH_FILE)) {
    log(`❌ Sesión de Facebook no encontrada. Ejecuta: node automatizacion-redes/facebook-groups-bot.mjs --setup`, "ERROR");
    return false;
  }

  // Leer configuración de visibilidad (headless/headful)
  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  let headless = false;
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      headless = config.headless !== undefined ? config.headless : false;
    } catch(e){}
  }

  isPlaywriter = false;

  // 1. Conectar a Playwriter (navegador real)
  try {
    log("🔗 Conectando a Playwriter (CDP Puerto 19988)...");
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    log("✅ Conectado a Playwriter exitosamente.");
    context = browser.contexts()[0];

    // Cerrar proactivamente pestañas anteriores de Facebook para no saturar el sistema
    try {
      const pages = context.pages();
      for (const p of pages) {
        const url = p.url();
        if (url.includes('facebook.com') || url === 'about:blank' || url === '') {
          log(`🧹 Cerrando pestaña previa inactiva de Facebook: ${url}`);
          await p.close().catch(() => {});
        }
      }
    } catch (err) {
      log(`⚠️ No se pudieron limpiar las pestañas anteriores: ${err.message}`, "WARN");
    }

    page = await context.newPage();
  } catch (e) {
    log(`⚠️ Conexión a Playwriter falló (${e.message}). Iniciando Chromium local de respaldo...`, "WARN");
    browser = await localChromium.launch({
      headless: headless === true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    context = await browser.newContext({
      storageState: AUTH_FILE,
      viewport: { width: 1280, height: 800 }
    });
    page = await context.newPage();
  }

  try {
    // --- Cargar lista de grupos (dinámica o fallback) ---
    let activeGroups = loadDiscoveredGroups();

    // Si los grupos tienen más de 24 horas o son los de fallback, redescubrir
    let shouldDiscover = true;
    try {
      if (fs.existsSync(DISCOVERED_GROUPS_FILE)) {
        const meta = JSON.parse(fs.readFileSync(DISCOVERED_GROUPS_FILE, 'utf-8'));
        const ageMs = Date.now() - new Date(meta.updatedAt || 0).getTime();
        shouldDiscover = ageMs > 24 * 60 * 60 * 1000; // más de 24 horas
      }
    } catch {}

    if (shouldDiscover) {
      log(`🔄 Actualizando lista de grupos (descubrimiento automático)...`);
      const freshGroups = await discoverGroups(page);
      if (freshGroups) activeGroups = freshGroups;
    }

    // Filtrar grupos con IDs numéricos (suelen ser grupos privados o eliminados)
    const namedGroups = activeGroups.filter(url => {
      const slug = url.replace(/\/+$/, '').split('/').pop();
      return isNaN(slug); // Solo grupos con nombre legible (no IDs numéricos)
    });
    const groupList = namedGroups.length > 0 ? namedGroups : activeGroups;

    // Seleccionar el grupo que hace más tiempo que no se visita (o nunca visitado)
    const visited = state.visitedGroups || {};
    const now = Date.now();
    const MIN_HOURS_BETWEEN_VISITS = 20; // No volver a un grupo antes de 20h
    const MIN_MS = MIN_HOURS_BETWEEN_VISITS * 60 * 60 * 1000;

    const sortedGroups = groupList.slice().sort((a, b) => {
      const tA = visited[a] ? new Date(visited[a]).getTime() : 0;
      const tB = visited[b] ? new Date(visited[b]).getTime() : 0;
      return tA - tB; // El menos visitado primero
    });

    // Preferir grupos que no se visitaron en las últimas 20h
    const eligibleGroups = sortedGroups.filter(g => {
      if (!visited[g]) return true; // nunca visitado → siempre elegible
      return (now - new Date(visited[g]).getTime()) >= MIN_MS;
    });

    const groupUrl = eligibleGroups.length > 0 ? eligibleGroups[0] : sortedGroups[0];
    const lastVisit = visited[groupUrl];
    const timeSince = lastVisit ? now - new Date(lastVisit).getTime() : Infinity;

    if (eligibleGroups.length === 0) {
      log(`⚠️ Todos los grupos fueron visitados recientemente. Usando el más antiguo (${(timeSince/3600000).toFixed(1)}h).`, 'WARN');
    }

    if (lastVisit) {
      const hoursAgo = (timeSince / 3600000).toFixed(1);
      log(`🌐 Grupo seleccionado (última visita hace ${hoursAgo}h): ${groupUrl}`);
    } else {
      log(`🌐 Grupo seleccionado (nunca visitado previamente): ${groupUrl}`);
    }

    try {
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      log(`⚠️ Timeout navegando al grupo. Saltando al siguiente... (${navErr.message})`, 'WARN');
      state.visitedGroups = state.visitedGroups || {};
      state.visitedGroups[groupUrl] = new Date().toISOString(); // Mandar al final de la cola para no atascarse
      saveState(state);
      await page.close().catch(() => {});
      return true; // No es un error fatal, simplemente saltamos este grupo
    }
    await page.waitForTimeout(6000);

    // Verificar si se requiere login
    const needLogin = await page.$('input[name="email"], #loginbutton, [data-testid="royal_login_button"]').catch(() => null);
    if (needLogin) {
      log("❌ La sesión de Facebook ha expirado. Por favor, ejecuta el setup manual nuevamente.", "ERROR");
      await page.close();
      if (!isPlaywriter) await browser.close();
      return false;
    }

    // --- DIAGNÓSTICO: Loguear qué hay en la página ---
    const pageTitle = await page.title().catch(() => '(sin título)');
    log(`📄 Página cargada: "${pageTitle}"`);

    // --- ACCIÓN A: Crear Publicación ---
    let postIndex = state.nextPostIndex % POST_TEMPLATES.length;
    let postContent = POST_TEMPLATES[postIndex];
    let postAttempts = 0;
    let skipPosting = false;
    
    // Rotar si ya se publicó este contenido en este grupo recientemente
    while (await hasPostedContent('facebook', groupUrl, postContent) && postAttempts < POST_TEMPLATES.length) {
      log(`⏭️ Contenido ya publicado en este grupo en los últimos 7 días. Probando siguiente plantilla...`);
      state.nextPostIndex++;
      postIndex = state.nextPostIndex % POST_TEMPLATES.length;
      postContent = POST_TEMPLATES[postIndex];
      postAttempts++;
    }
    
    if (postAttempts >= POST_TEMPLATES.length) {
      log(`⏭️ Todos los posts en el repertorio ya se publicaron en este grupo recientemente. Saltando publicación en esta ronda para evitar spam.`);
      skipPosting = true;
    }

    if (!skipPosting) {
      log(`📝 Creando post (Índice ${postIndex + 1}/${POST_TEMPLATES.length}): "${postContent.substring(0, 60)}..."`);

    // Estrategia multi-selector para abrir el compositor de posts en grupos de Facebook
    // Facebook cambia sus clases frecuentemente, usamos aria-label y roles estables
    const postBoxSelectors = [
      '[aria-label="Crear una publicación pública..."]',
      '[aria-label="Create a public post..."]',
      '[aria-label="Escribe algo..."]',
      '[aria-label="Write something..."]',
      '[placeholder*="Escribe algo"]',
      '[placeholder*="Write something"]',
      '[data-testid="status-attachment-mentions-input"]',
      'div[role="button"][tabindex="0"]:has(span:has-text("Escribe algo"))',
      'div[role="button"][tabindex="0"]:has(span:has-text("Crear"))',
      'div[role="button"]:has(span:has-text("Escribe algo"))',
      'div[role="button"]:has(span:has-text("Write something"))',
      'div[role="combobox"]',
    ];

    let postInputOpened = false;
    for (const sel of postBoxSelectors) {
      try {
        const box = page.locator(sel).first();
        const count = await box.count();
        if (count > 0) {
          const visible = await box.isVisible().catch(() => false);
          if (visible) {
            log(`🎯 Compositor encontrado con selector: ${sel}`);
            await box.scrollIntoViewIfNeeded().catch(() => {});
            await box.click({ timeout: 5000 });
            postInputOpened = true;
            break;
          }
        }
      } catch {}
    }

    if (!postInputOpened) {
      log(`⚠️ Compositor no encontrado por selectores directos. Intentando vía JavaScript...`, 'WARN');
      // Intento por evaluación JS: buscar cualquier div clickeable que parezca un composer
      await page.evaluate(() => {
        const candidates = [...document.querySelectorAll('div[role="button"]')];
        const composer = candidates.find(el => {
          const text = el.textContent || '';
          return text.includes('Escribe') || text.includes('Write') || text.includes('Crear') || text.includes('Create');
        });
        if (composer) composer.click();
      });
      await page.waitForTimeout(3000);

      // Último recurso: intentar navegar directamente a la URL de creación de post del grupo
      const groupId = groupUrl.replace(/\/+$/, '').split('/').pop();
      log(`🔗 Intentando URL directa de compositor para grupo: ${groupId}`);
      await page.goto(`${groupUrl}?show_post_composer=true`, {
        waitUntil: 'domcontentloaded', timeout: 20000
      }).catch(() => {});
      await page.waitForTimeout(4000);

      // Re-intentar detectar textbox tras navegar
      for (const sel of [
        'div[role="textbox"][contenteditable="true"]',
        '[data-lexical-editor="true"]',
        'div[aria-multiline="true"][contenteditable="true"]'
      ]) {
        const el = page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
          log(`✅ Textbox encontrado tras URL directa: ${sel}`);
          await el.click();
          postInputOpened = true;
          break;
        }
      }
    }

    await page.waitForTimeout(3000);

    // --- Buscar el textbox del COMPOSITOR (no el de comentarios) ---
    // El compositor se abre en un diálogo modal. Buscamos dentro de él primero.
    // Excluimos textboxes con placeholder de "Comentar" que no son el compositor.
    let textBoxFound = false;
    let activeTextBox = null;

    // Estrategia 1: buscar dentro del diálogo modal que se abre al clickear el compositor
    const dialogTextbox = await page.evaluate(() => {
      // Buscar el diálogo/modal abierto
      const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')];
      for (const dialog of dialogs) {
        const tb = dialog.querySelector('[role="textbox"][contenteditable="true"], [data-lexical-editor="true"]');
        if (tb) {
          // Verificar que NO es un campo de comentario
          const label = (tb.getAttribute('aria-label') || '').toLowerCase();
          const placeholder = (tb.getAttribute('aria-placeholder') || '').toLowerCase();
          if (!label.includes('comentar') && !placeholder.includes('comentar') &&
              !label.includes('comment') && !placeholder.includes('comment')) {
            tb.click();
            return true;
          }
        }
      }
      return false;
    });

    if (dialogTextbox) {
      log(`✏️ Textbox del compositor encontrado dentro del diálogo modal.`);
      textBoxFound = true;
      // Enfocar con keyboard para asegurar
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
    }

    // Estrategia 2: selectores directos excluyendo comentarios
    if (!textBoxFound) {
      const textboxSelectors = [
        // Textbox que NO sea de comentarios (filtramos por aria-placeholder)
        'div[data-lexical-editor="true"]:not([aria-placeholder*="Comentar"]):not([aria-placeholder*="comment"])',
        'div[role="textbox"][contenteditable="true"][aria-label*="pensando"]',
        'div[role="textbox"][contenteditable="true"][aria-label*="thinking"]',
        'div[role="textbox"][contenteditable="true"][aria-placeholder*="Escribe"]',
        'div[role="textbox"][contenteditable="true"][aria-placeholder*="Write"]',
      ];

      for (const sel of textboxSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
            log(`✏️ Textbox compositor encontrado con: ${sel}`);
            activeTextBox = el;
            textBoxFound = true;
            break;
          }
        } catch {}
      }
    }

    // Estrategia 3: JS directo para forzar focus en el primer textbox que no sea comentario
    if (!textBoxFound) {
      log(`⚠️ Textbox no encontrado por selectores. Intentando foco JS...`, 'WARN');
      const jsFocused = await page.evaluate(() => {
        const allTextboxes = [...document.querySelectorAll('[role="textbox"][contenteditable="true"], [data-lexical-editor="true"]')];
        const composer = allTextboxes.find(el => {
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          const placeholder = (el.getAttribute('aria-placeholder') || '').toLowerCase();
          return !label.includes('comentar') && !placeholder.includes('comentar') &&
                 !label.includes('comment') && !placeholder.includes('comment');
        });
        if (composer) {
          composer.focus();
          composer.click();
          return true;
        }
        return false;
      });
      if (jsFocused) {
        log(`✏️ Textbox compositor encontrado y enfocado via JS.`);
        textBoxFound = true;
      }
    }

    if (textBoxFound) {
      if (activeTextBox) {
        // click con force para pasar overlays de Facebook
        await activeTextBox.click({ force: true }).catch(async () => {
          // Si force falla también, usar JS focus
          await page.evaluate(() => {
            const el = document.activeElement;
            if (el) el.focus();
          });
        });
      }
      await page.waitForTimeout(800);

      // --- INYECCIÓN VIA CLIPBOARD (necesario para el editor Lexical de Facebook) ---
      // page.keyboard.type() no funciona bien con Lexical. Usamos execCommand + clipboard.
      log(`📋 Inyectando texto via clipboard (${postContent.length} chars)...`);

      const injected = await page.evaluate(async (text) => {
        try {
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          const ok = document.execCommand('insertText', false, text);
          if (ok) return 'execCommand';
        } catch {}
        try {
          await navigator.clipboard.writeText(text);
          return 'clipboard_api';
        } catch {}
        return null;
      }, postContent);

      if (injected === 'execCommand') {
        log(`✅ Texto inyectado via execCommand.`);
      } else if (injected === 'clipboard_api') {
        log(`📋 Pegando texto via Ctrl+V...`);
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+v');
      } else {
        log(`⌨️ Fallback: tipeo directo...`, 'WARN');
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.type(postContent, { delay: 15 });
      }

      await page.waitForTimeout(2500);


      // Buscar botón Publicar dentro del diálogo primero, luego en la página
      let postPublished = false;
      const publishBtnSelectors = [
        '[aria-label="Publicar"]',
        '[aria-label="Post"]',
        'div[role="button"]:has-text("Publicar")',
        'div[role="button"]:has-text("Post")',
        'span:has-text("Publicar")',
        'button:has-text("Publicar")',
        'button:has-text("Post")',
      ];

      for (const sel of publishBtnSelectors) {
        try {
          const btn = page.locator(sel).last();
          if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
            log(`🚀 Botón publicar encontrado con: ${sel}`);
            await btn.click({ force: true });
            postPublished = true;
            break;
          }
        } catch {}
      }

      if (postPublished) {
        log("✅ ¡Post publicado con éxito en el grupo!");
        state.nextPostIndex++;
        await addPostCreated('facebook', groupUrl, groupUrl, postContent);
      } else {
        log("⚠️ Botón publicar no encontrado. Enviando con Ctrl+Enter...", "WARN");
        await page.keyboard.press('Control+Enter');
        state.nextPostIndex++;
        await addPostCreated('facebook', groupUrl, groupUrl, postContent);
      }
      await page.waitForTimeout(6000);
    } else {
      log("⚠️ No se encontró textbox del compositor. Saltando publicación.", "WARN");
    }
  } // Cierre de if (!skipPosting)

    // --- ACCIÓN B: Comentar en Posts Existentes (Outreach orgánico) ---
    log("📜 Desplazando para buscar posts de otros traders...");
    for (let s = 0; s < 4; s++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(3000);

    // Selectores de botones de comentar en Facebook 2024/2025
    const commentBtnSelectors = [
      '[aria-label="Comentar"]',
      '[aria-label="Comment"]',
      '[aria-label*="comentario"]',
      '[aria-label*="comment"]',
      'div[role="button"]:has-text("Comentar")',
      'div[role="button"]:has-text("Comment")',
      'span:has-text("Comentar")',
    ];

    let commentBtns = [];
    for (const sel of commentBtnSelectors) {
      const found = await page.$$(sel);
      if (found.length > 0) {
        log(`💬 Botones de comentar encontrados (${found.length}) con: ${sel}`);
        commentBtns = found;
        break;
      }
    }
    log(`🔍 Total posts candidatos para prospectar: ${commentBtns.length}`);

    let commentsMade = 0;
    // Máximo 1 comentario por grupo por ciclo para no spamear
    const maxComments = 1;

    for (let i = 0; i < commentBtns.length && commentsMade < maxComments; i++) {
      try {
        log(`💬 Evaluando post número ${i + 1} para comentar...`);
        await commentBtns[i].scrollIntoViewIfNeeded().catch(() => {});
        
        // Obtener TEXTO y URL real del post para deduplicación
        // NOTA: commentBtns[i] ya ES un ElementHandle (de page.$$), no un Locator.
        const { postText, postUrl: realPostUrl } = await page.evaluate((btn) => {
          if (!btn) return { postText: '', postUrl: '' };
          let container = btn;
          for (let k = 0; k < 12; k++) {
            container = container.parentElement;
            if (!container) break;
            const role = container.getAttribute('role');
            if (role === 'article' || container.getAttribute('data-ad-preview')) break;
          }
          let text = '';
          let url = '';
          if (container) {
            const textEl = container.querySelector('[data-ad-preview="message"], [data-testid="post_message"]');
            text = textEl ? textEl.textContent : (container.innerText || '');
            // Intentar obtener URL real del post desde el timestamp-link
            const tsLink = container.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="?story_fbid"], a[href*="groups"][href*="permalink"]');
            if (tsLink) url = tsLink.href;
          }
          return { postText: text, postUrl: url };
        }, commentBtns[i]).catch(() => ({ postText: '', postUrl: '' }));

        if (postText) {
          const cleanText = postText.substring(0, 100).replace(/\n/g, ' ').trim();
          log(`📝 Texto del post: "${cleanText}" | URL: ${realPostUrl || '(sin URL)'}`);
          if (await hasCommentedPost('facebook', realPostUrl || null, postText)) {
            log(`⏭️ [social_db] Publicación ya comentada previamente. Saltando.`);
            continue;
          }
        }

        // Clic en comentar para desplegar comentarios e input
        await commentBtns[i].click({ force: true }).catch(() => {});
        await page.waitForTimeout(3000);

        // Chequear en el DOM si ya aparece nuestro nombre en el hilo de comentarios de esta publicación
        const alreadyCommentedLive = await page.evaluate((btn) => {
          if (!btn) return false;
          let container = btn;
          for (let k = 0; k < 12; k++) {
            container = container.parentElement;
            if (!container) break;
            const role = container.getAttribute('role');
            if (role === 'article' || container.getAttribute('data-ad-preview')) {
              break;
            }
          }
          if (container) {
            // Facebook muestra los nombres de los autores en los links o textos de comentarios
            const commentsContainer = container.querySelector('ul, div[role="group"]');
            if (commentsContainer) {
              const textContent = commentsContainer.innerText || '';
              return textContent.includes('Braian Iurato') || textContent.includes('tradeshare.ok');
            }
          }
          return false;
        }, commentBtns[i]).catch(() => false);

        if (alreadyCommentedLive) {
          log(`⏭️ [DOM] Ya comentamos en esta publicación visiblemente ("Braian Iurato" o "tradeshare.ok" encontrado). Saltando.`);
          if (postText) await addCommentMade('facebook', realPostUrl || null, postText, '(detectado en vivo)');
          continue;
        }

        // Buscar el input de comentario activo con múltiples selectores
        const commentInputSelectors = [
          'div[role="textbox"][contenteditable="true"]',
          '[aria-label="Escribe un comentario…"]',
          '[aria-label="Write a comment…"]',
          '[aria-label*="comentario"][contenteditable]',
          '[aria-label*="comment"][contenteditable]',
          'div[aria-multiline="true"][contenteditable="true"]',
        ];
        let commentInput = null;
        for (const cSel of commentInputSelectors) {
          const inputs = await page.$$(cSel);
          if (inputs.length > 0) {
            commentInput = inputs[inputs.length - 1]; // el último activo
            log(`✏️ Input de comentario encontrado con: ${cSel}`);
            break;
          }
        }
        if (commentInput) {
          await commentInput.click();
          await page.waitForTimeout(600);

          // Rotar template hasta encontrar uno que no se haya usado recientemente
          let commentText = '';
          let templateAttempts = 0;
          do {
            const idx = Math.floor(Math.random() * COMMENT_TEMPLATES.length);
            commentText = COMMENT_TEMPLATES[idx];
            templateAttempts++;
          } while (
            await hasCommentTextBeenUsed('facebook', commentText, 5) &&
            templateAttempts < COMMENT_TEMPLATES.length
          );

          log(`⌨️ Tipeando comentario: "${commentText.substring(0, 60)}..."`);
          await page.keyboard.type(commentText, { delay: 25 });
          await page.waitForTimeout(1200);

          // Enviar con Enter
          await page.keyboard.press('Enter');
          log(`✅ Comentario enviado con éxito.`);
          commentsMade++;
          
          // Guardar con URL real del post para mejor deduplicación futura
          await addCommentMade('facebook', realPostUrl || null, postText || '', commentText);

          // Jitter: enfriamiento aleatorio entre comentarios (entre 20 y 40 segundos)
          const waitTime = Math.floor(Math.random() * 20) + 20;
          log(`😴 Cooldown de seguridad: esperando ${waitTime} segundos...`);
          await page.waitForTimeout(waitTime * 1000);
        }
      } catch (postErr) {
        log(`⚠️ Error interactuando con post para comentar: ${postErr.message}`, "WARN");
      }
    }

    // Actualizar estado para la próxima ronda
    state.visitedGroups = state.visitedGroups || {};
    state.visitedGroups[groupUrl] = new Date().toISOString();
    state.lastRun = new Date().toISOString();
    saveState(state);
    
    log(`🏁 Ronda del bot de Facebook Groups finalizada con éxito. Grupo procesado: ${groupUrl}`);
    
    await page.close().catch(() => {});
    return true;

  } catch (err) {
    log(`❌ Error crítico en la ejecución del bot de Facebook Groups: ${err.message}`, "ERROR");
    if (page) await page.close().catch(() => {});
    return false;
  } finally {
    if (page) {
      log("🧹 Cerrando pestaña de trabajo de Facebook Groups...");
      await page.close().catch(() => {});
    }
    if (browser) {
      if (isPlaywriter) {
        log("🔌 Desconectando de Playwriter...");
        await browser.close().catch(() => {});
      } else {
        await browser.close().catch(() => {});
      }
    }
  }
}

// --- Setup de Sesión de Facebook ---
async function setupFacebookSession() {
  log("🔐 Abriendo navegador visible para iniciar sesión en Facebook...");
  const browser = await localChromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  log("⚠️  ACCIÓN REQUERIDA: Inicia sesión con tu cuenta de Facebook en la ventana que se acaba de abrir.");
  log("⏳ Tienes 90 segundos para completar el login. Mantén el navegador abierto.");

  await page.waitForTimeout(90000);

  log("💾 Guardando estado de sesión...");
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await context.storageState({ path: AUTH_FILE });
  log(`✅ ¡Sesión guardada con éxito en: ${AUTH_FILE}`);
  log("🚀 Ahora puedes ejecutar el bot con: node automatizacion-redes/facebook-groups-bot.mjs --test");

  await browser.close();
}

// --- Modo CLI / Daemon ---
const isTestMode = process.argv.includes('--test');
const isSetupMode = process.argv.includes('--setup');

async function start() {
  if (isSetupMode) {
    log("🔐 MODO SETUP: Configurando sesión de Facebook...");
    await setupFacebookSession();
    process.exit(0);
  }

  if (isTestMode) {
    log("🧪 MODO TEST: Ejecutando una sola ronda de prueba inmediatamente...");
    const ok = await runBotRound();
    process.exit(ok ? 0 : 1);
  }

  log("🛡️ MODO DAEMON: Iniciando ciclo continuo — 127 grupos, ~15 min por grupo...");
  // Intervalo por grupo: 15 minutos base + Jitter ±2 min para evitar patrones rígidos
  // Con 127 grupos totales: ciclo completo seguro y distribuido.
  const BASE_INTERVAL = 15 * 60 * 1000; // 15 minutos

  while (true) {
    await runBotRound().catch(e => log(`Error en ciclo: ${e.message}`, "ERROR"));
    
    // Jitter aleatorio ±1 minuto para evitar patrones fijos detectables
    const jitter = (Math.random() - 0.5) * 2 * 60 * 1000; // ±1 min
    const nextInterval = BASE_INTERVAL + jitter;
    const nextIntervalSec = Math.round(nextInterval / 1000);
    const nextIntervalMin = (nextIntervalSec / 60).toFixed(1);
    
    log(`⏱️ Próximo grupo en ${nextIntervalMin} min (${nextIntervalSec}s)...`);
    await new Promise(resolve => setTimeout(resolve, nextInterval));
  }
}

start().catch(e => {
  console.error("💥 Error crítico fatal en start():", e);
  process.exit(1);
});
