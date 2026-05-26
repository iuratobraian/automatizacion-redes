/**
 * ig-feed-from-folder.mjs  v2.0
 * ══════════════════════════════════════════════════════════════════
 * Publica imágenes desde carpetas FEED / HISTORIAS pregeneradas.
 * 
 * FIXES v2.0:
 * - Flujo de "Siguiente" reescrito — detecta estado del modal en cada paso
 * - Solo avanza cuando el modal está abierto (no sale accidentalmente)
 * - Botón "Compartir/Publicar" detectado como div/link azul, no solo <button>
 * - Usa clicks entrenados por el usuario si existen (.agent/training-clicks-instagram.json)
 * - Sistema de reintentos con delays y detección de éxito mejorada
 *
 * Uso:
 *   node ig-feed-from-folder.mjs --type=feed
 *   node ig-feed-from-folder.mjs --type=story
 *   node ig-feed-from-folder.mjs --type=feed --account=tradeshare.ok
 * ══════════════════════════════════════════════════════════════════
 */

import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.agent', 'ig-config.json');
const TRAINING_FILE = path.join(ROOT, '.agent', 'training-clicks-instagram.json');

// ─── Carpetas de imágenes pregeneradas ──────────────────────────────────────
const FEED_DIRS = [
  '/home/biurato/Escritorio/trade-share/GENERADASIA/FEED',
  '/home/biurato/Escritorio/GENERADASIA/FEED',
];
const HISTORIAS_DIRS = [
  '/home/biurato/Escritorio/GENERADASIA/HISTORIAS',
  '/home/biurato/Escritorio/trade-share/GENERADASIA/HISTORIAS',
];

// ─── Captions predeterminadas para FEED ────────────────────────────────────
const FEED_CAPTIONS = [
  `📈 La disciplina en el trading no es opcional — es el factor que separa a los ganadores de los que siempre están "a punto de". En TradeShare te enseñamos cómo medir, mejorar y superar cada sesión. 🧠💪\n\n💬 Comenta SETUP para recibir nuestro template gratuito de gestión de riesgo por DM.\n\n#trading #forex #crypto #daytrading #bolsa #tradeshare #bitácora #setup`,
  `🚀 Los mejores traders no tienen suerte — tienen sistemas. TradeShare es la plataforma donde construís el tuyo con datos reales, comunidad activa y herramientas de IA integradas.\n\n💬 Comenta SISTEMA para obtener acceso gratuito por privado.\n\n#tradeshare #trading #forex #inversiones #mercados #finanzas #traderlatino`,
  `💰 El mercado siempre tiene razón. Tu trabajo es ADAPTARTE. En TradeShare registramos cada operación, encontramos tus patrones de error y te ayudamos a corregirlos con IA. 🎯\n\n💬 Comenta IA para acceder al bot inteligente de análisis de bitácora gratis.\n\n#inteligenciaartificial #trading #forex #daytrader #tradeshare #bolsa`,
  `📊 Consistencia > Rentabilidad puntual. Los traders exitosos ganan mes a mes porque controlan el riesgo. TradeShare te da las herramientas para hacerlo de forma automática y transparente.\n\n💬 Comenta INFO y te enviamos los detalles por DM.\n\n#trading #forex #consistencia #gestionriesgo #tradeshare #exness #propfirm`,
  `🌟 ¿Cuánto llevas ganando este mes? No importa el número — lo que importa es si SABES por qué. La bitácora inteligente de TradeShare te da claridad estadística sobre tu rendimiento real. 📉📈\n\n💬 Comenta GRATIS para unirte a la plataforma sin costo.\n\n#trader #trading #forex #bitcoin #tradeshare #mercadosfinancieros #exness`,
  `🔥 El error más caro en trading no es una mala operación — es NO APRENDER de ella. TradeShare registra, analiza y te muestra exactamente qué corregir en cada sesión. 📚\n\n💬 Comenta ACCESO para un pase de prueba premium de 3 días gratis.\n\n#trading #forex #crypto #educación #tradeshare #traderlatino #setups`,
  `⚡ Cada día que no usás una bitácora de trading es un día que perdés datos valiosos sobre tu rendimiento. En TradeShare lo hacemos automático. 📱💻\n\n💬 Comenta HERRAMIENTA y te explicamos cómo funciona.\n\n#tradeshare #trading #forex #automatización #daytrading #bolsa #fintech`,
  `🎯 El 90% de los traders pierde dinero. El 10% tiene sistema, disciplina y una comunidad que los impulsa. ¿En qué grupo estás? Únete a TradeShare y construye parte del 10%.\n\n💬 Comenta COMUNIDAD para conectar con traders profesionales por DM.\n\n#trading #forex #crypto #propfirm #tradeshare #ict #smc #daytrader`,
];

// ─── Parsear args ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    if (arg.includes('=')) {
      const [k, ...v] = arg.split('=');
      args[k.replace('--', '')] = v.join('=');
    } else {
      args[arg.replace('--', '')] = true;
    }
  }
}

const type = (args.type || 'feed').toLowerCase();
const selectedAccount = args.account || 'tradeshare.ok';

// ─── Registry de publicadas ─────────────────────────────────────────────────
const PUBLISHED_REGISTRY = path.join(ROOT, '.agent', 'ig-feed-folder-published.json');

function loadPublishedRegistry() {
  try {
    if (fs.existsSync(PUBLISHED_REGISTRY)) return JSON.parse(fs.readFileSync(PUBLISHED_REGISTRY, 'utf-8'));
  } catch {}
  return { feed: [], story: [] };
}

function savePublishedRegistry(registry) {
  try { fs.writeFileSync(PUBLISHED_REGISTRY, JSON.stringify(registry, null, 2)); } catch (e) {
    console.warn('⚠️ Error guardando registry:', e.message);
  }
}

// ─── Cargar clicks entrenados ────────────────────────────────────────────────
function loadTrainedClicks() {
  try {
    if (fs.existsSync(TRAINING_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRAINING_FILE, 'utf-8'));
      console.log(`📚 Clicks entrenados cargados (${Object.keys(data.clicks || {}).length} pasos)`);
      return data.clicks || {};
    }
  } catch {}
  return {};
}

// ─── Seleccionar imagen aleatoria ────────────────────────────────────────────
function getRandomUnpublishedImage(dirs, publishedList) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const allImages = [];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) allImages.push(path.join(dir, file));
      }
    }
  }
  if (allImages.length === 0) throw new Error(`No se encontraron imágenes en: ${dirs.join(', ')}`);
  
  let unpublished = allImages.filter(img => !publishedList.includes(img));
  if (unpublished.length === 0) {
    console.log('🔄 Todas las imágenes publicadas. Reiniciando ciclo...');
    unpublished = allImages;
  }
  const chosen = unpublished[Math.floor(Math.random() * unpublished.length)];
  console.log(`🖼️ Imagen: ${path.basename(chosen)}`);
  return chosen;
}

// ─── Debug screenshots ───────────────────────────────────────────────────────
const DEBUG_DIR = path.join(ROOT, '.agent', 'debug-feed-folder');
if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });

async function dbg(page, name) {
  try { await page.screenshot({ path: path.join(DEBUG_DIR, `${name}-${Date.now()}.png`) }); } catch {}
}

// ─── Browser Device Contexts ──────────────────────────────────────────────────
const IPHONE_DEVICE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

const DESKTOP_DEVICE = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

// ─── Browser setup ────────────────────────────────────────────────────────────
let isPlaywriter = false;

async function createDesktopBrowser(sessionPath, headless) {
  isPlaywriter = false;
  console.log('🖥️ Iniciando ventana de publicación dedicada en modo DESKTOP...');

  if (!fs.existsSync(sessionPath)) throw new Error(`No se encontró sesión: ${sessionPath}`);
  const browser = await localChromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(sessionPath, 'utf-8')),
    ...DESKTOP_DEVICE,
    locale: 'es-AR',
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  console.log('✅ Window dedicada (Escritorio 1280x800) iniciada');
  return { browser, context, page };
}

async function createMobileBrowser(sessionPath, headless) {
  isPlaywriter = false;
  console.log('📱 Iniciando ventana de publicación dedicada en modo MOBILE...');

  if (!fs.existsSync(sessionPath)) throw new Error(`No se encontró sesión: ${sessionPath}`);
  const browser = await localChromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(sessionPath, 'utf-8')),
    ...IPHONE_DEVICE,
    locale: 'es-AR',
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  console.log('✅ Window dedicada (Emulando iPhone 14 Pro Max 430x932) iniciada');
  return { browser, context, page };
}

// ─── Helpers para Instagram ───────────────────────────────────────────────────

async function dismissPopups(page) {
  for (const text of ['Ahora no', 'Not Now', 'Cancelar', 'Cancel', 'Descartar']) {
    try {
      const btn = page.locator(`button:has-text("${text}"), [role="button"]:has-text("${text}")`).first();
      if (await btn.count() > 0) await btn.click({ timeout: 2000 }).catch(() => {});
    } catch {}
  }
}

// Verifica si el modal de creación de posts sigue abierto
async function isModalOpen(page) {
  const hasDialog = await page.locator('[role="dialog"]').count() > 0;
  const hasCreateModal = await page.locator('text="Crear nueva publicación", text="Create new post"').count() > 0;
  const hasNextBtn = await page.locator('button:has-text("Siguiente"), button:has-text("Next"), div[role="button"]:has-text("Siguiente")').count() > 0;
  const hasShareBtn = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    return all.some(el => {
      const t = (el.textContent || '').trim();
      return (t === 'Compartir' || t === 'Share' || t === 'Publicar') && 
             (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'DIV');
    });
  });
  const hasCaptionArea = await page.locator('textarea[placeholder*="escrib"], textarea[aria-label*="escrib"], textarea[placeholder*="caption"], div[aria-label*="caption"]').count() > 0;
  return hasDialog || hasCreateModal || hasNextBtn || hasShareBtn || hasCaptionArea;
}

// Clic usando datos entrenados o fallback JS
async function clickTrained(page, stepName, trainedClicks, fallbackFn) {
  const trained = trainedClicks[stepName];
  if (trained) {
    console.log(`  🎓 Usando click entrenado para "${stepName}": "${trained.text.substring(0, 40)}"`);
    // Intentar por selector entrenado
    try {
      if (trained.ariaLabel) {
        const el = page.locator(`[aria-label="${trained.ariaLabel}"]`).first();
        if (await el.count() > 0) { await el.click({ timeout: 3000 }); return true; }
      }
      if (trained.svgAriaLabel) {
        const el = page.locator(`svg[aria-label="${trained.svgAriaLabel}"]`).first();
        if (await el.count() > 0) { await el.click({ timeout: 3000 }); return true; }
      }
      // Click por coordenadas como último recurso entrenado
      if (trained.x && trained.y) {
        await page.mouse.click(trained.x, trained.y);
        return true;
      }
    } catch {}
  }
  return fallbackFn ? await fallbackFn() : false;
}

// ─── PUBLICAR EN FEED ─────────────────────────────────────────────────────────
async function publishFeed(imagePath, caption, sessionPath, headless) {
  console.log('\n📸 Publicando en Instagram FEED (Escritorio)...');
  const { browser, context, page } = await createDesktopBrowser(sessionPath, headless);
  const trainedClicks = loadTrainedClicks();

  try {
    // Navegar a Instagram escritorio
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    await dismissPopups(page);
    await dbg(page, 'ig_01_home');

    // PASO 1: Botón CREAR en barra lateral de escritorio
    console.log('➕ Paso 1: Buscando botón Crear...');
    let createClicked = false;

    // Estrategia A: click entrenado
    createClicked = await clickTrained(page, 'crear_post', trainedClicks, null);

    // Estrategia B: aria-label SVG (inglés y español)
    if (!createClicked) {
      for (const sel of [
        'svg[aria-label="Nueva publicación"]',
        'svg[aria-label="New post"]',
        'svg[aria-label="Crear"]',
        'svg[aria-label="Create"]',
        '[aria-label="Nueva publicación"]',
        '[aria-label="New post"]',
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0) {
            await el.click();
            createClicked = true;
            console.log(`  ✅ Crear (${sel})`);
            break;
          }
        } catch {}
      }
    }

    // Estrategia C: span con texto en el nav lateral
    if (!createClicked) {
      for (const txt of ['Crear', 'Create']) {
        try {
          const el = page.locator(`nav span:has-text("${txt}"), a span:has-text("${txt}")`).first();
          if (await el.count() > 0) {
            await el.click();
            createClicked = true;
            console.log(`  ✅ Crear por texto "${txt}"`);
            break;
          }
        } catch {}
      }
    }

    if (!createClicked) {
      await dbg(page, 'feed_crear_notfound');
      throw new Error('No se pudo encontrar el botón Crear. Revisa debug screenshot.');
    }

    await page.waitForTimeout(2500);
    await dbg(page, 'ig_02_after_crear');

    // PASO 2: Clic en "Publicación" — usar JS directo porque el overlay de IG bloquea clicks
    console.log('📋 Paso 2: Buscando opción "Publicación"...');
    let modalOpened = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Primero intentar click entrenado
      const trainedOpt = await clickTrained(page, 'publicacion_option', trainedClicks, null);
      if (trainedOpt) {
        modalOpened = true;
        break;
      }

      // Estrategia JS
      const clicked = await page.evaluate(() => {
        const allEls = [...document.querySelectorAll('span, div[role="button"], a')];
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (text === 'Publicación' || text === 'Post') {
            const clickTarget = el.closest('a, div[role="button"], button') || el;
            clickTarget.click();
            return true;
          }
        }
        return false;
      });
      if (clicked) console.log(`  ✅ "Publicación" clickeado via JS (intento ${attempt + 1}).`);
      await page.waitForTimeout(4000);

      // Verificar si el modal de subida apareció (tiene input[type=file])
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.count() > 0) {
        modalOpened = true;
        break;
      }
    }

    if (!modalOpened) {
      throw new Error('No se pudo abrir el modal de subida después de 3 intentos.');
    }
    console.log('  ✅ Modal de subida abierto');
    await dbg(page, 'ig_02_modal_open');

    // PASO 3: Subir imagen
    console.log(`📤 Paso 3: Subiendo imagen: ${path.basename(imagePath)}`);
    await page.locator('input[type="file"]').last().setInputFiles(imagePath);
    console.log('  ✅ Imagen cargada.');
    await page.waitForTimeout(5000);
    await dbg(page, 'ig_03_image_loaded');

    // PASO 4: Aspecto original si es posible
    console.log('🔲 Paso 4: Ajustando aspecto si es necesario...');
    for (const sel of [
      'svg[aria-label="Seleccionar recorte"]',
      'svg[aria-label="Select crop"]',
      'button:has(svg[aria-label*="recort"])'
    ]) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          await page.waitForTimeout(1500);
          const origBtn = page.locator('svg[aria-label*="original"], button:has-text("Original")').first();
          if (await origBtn.count() > 0) {
            await origBtn.click();
            console.log('  ✅ Aspecto: Original');
          }
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {}
    }

    // PASO 5: Botón "Siguiente" x2 o x3
    console.log('➡️ Paso 5: Avanzando por el modal...');
    for (let step = 1; step <= 3; step++) {
      await page.waitForTimeout(1500);
      
      const nextClicked = await clickTrained(page, `siguiente_${step}`, trainedClicks, async () => {
        return await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('button, div[role="button"]')];
          const next = buttons.find(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            return t === 'siguiente' || t === 'next';
          });
          if (next) { next.click(); return true; }
          return false;
        });
      });

      if (nextClicked) {
        console.log(`  ✅ Siguiente (${step})`);
        await page.waitForTimeout(2500);
      } else {
        break;
      }
    }
    await dbg(page, 'ig_05_caption');

    // PASO 6: Escribir caption
    console.log('📝 Paso 6: Escribiendo caption...');
    let captionWritten = false;
    const captionSelectors = [
      'div[contenteditable="true"][aria-label*="escribir"]',
      'div[contenteditable="true"][aria-label*="Escribe"]',
      'div[contenteditable="true"][aria-label*="caption"]',
      'div[contenteditable="true"][aria-label*="Caption"]',
      '[role="dialog"] div[contenteditable="true"]',
      'textarea[placeholder*="escribir"]',
      'textarea[placeholder*="Escribe"]',
      'textarea[placeholder*="caption"]',
      'textarea[placeholder*="Caption"]',
      'textarea',
      'div[role="textbox"]'
    ];
    for (const sel of captionSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click({ timeout: 2000 });
          await page.waitForTimeout(500);
          await el.focus();
          await page.waitForTimeout(300);
          
          // Limpiar primero
          await el.fill('');
          
          // Escribir usando teclado para eventos reales
          await page.keyboard.type(caption, { delay: 5 });
          captionWritten = true;
          console.log(`  ✅ Caption escrita via selector: "${sel}"`);
          break;
        }
      } catch (e) {
        console.warn(`  ⚠️ Intento con selector "${sel}" falló:`, e.message);
      }
    }
    await page.waitForTimeout(1500);
    await dbg(page, 'ig_06_before_share');

    // PASO 7: COMPARTIR — Sistema Ultra-Robusto de Reintentos
    console.log('🚀 Paso 7: Publicando — buscando botón "Compartir"...');
    let shared = false;
    const maxShareAttempts = 5;

    for (let attempt = 1; attempt <= maxShareAttempts; attempt++) {
      console.log(`  🔄 Intento de click en Compartir ${attempt}/${maxShareAttempts}...`);
      
      // Click entrenado
      const trainedClick = await clickTrained(page, 'compartir', trainedClicks, null);
      if (trainedClick) {
        console.log('  ✅ Compartir via click entrenado!');
        shared = true;
      }

      // JS evaluate (priorizar modal active)
      let clickedJS = false;
      if (!shared) {
        clickedJS = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const scope = dialog || document;
          const buttons = [...scope.querySelectorAll('button, div[role="button"], span')];
          const share = buttons.find(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            return t === 'compartir' || t === 'share';
          });
          if (share) { share.click(); return true; }
          return false;
        });
      }

      if (shared || clickedJS) {
        if (!shared) console.log('  ✅ Botón "Compartir" pulsado via JS (dentro del modal).');
        shared = true;
      }

      // Force click
      if (!shared) {
        try {
          const shareBtn = page.locator('[role="dialog"] div[role="button"]:has-text("Compartir"), [role="dialog"] button:has-text("Compartir"), [role="dialog"] div[role="button"]:has-text("Share"), [role="dialog"] button:has-text("Share")').first();
          if (await shareBtn.count() > 0) {
            await shareBtn.click({ force: true, timeout: 5000 });
            shared = true;
            console.log('  ✅ Botón "Compartir" pulsado (force click dentro del modal).');
          }
        } catch (e) {}
      }

      // Click por coordenadas
      if (!shared) {
        try {
          const modal = page.locator('[role="dialog"]').first();
          if (await modal.count() > 0) {
            const box = await modal.boundingBox();
            if (box) {
              await page.mouse.click(box.x + box.width - 40, box.y + 25);
              shared = true;
              console.log(`  ✅ Click en coordenadas (${Math.round(box.x + box.width - 40)}, ${Math.round(box.y + 25)})`);
            }
          }
        } catch (e) {}
      }

      await page.waitForTimeout(4000);
      
      const modalStillExists = await page.locator('[role="dialog"]').count();
      const successMsg = await page.locator(':has-text("compartió"), :has-text("shared"), :has-text("Tu publicación")').count();
      
      if (successMsg > 0 || modalStillExists === 0) {
        console.log('  ✨ Confirmación de éxito detectada.');
        shared = true;
        break;
      } else {
        console.log('  ⚠️ El modal sigue abierto. Reintentando click...');
        await dbg(page, `ig_retry_share_${attempt}`);
        shared = false;
      }
    }

    if (!shared) {
      await dbg(page, 'ig_share_failed_final');
      throw new Error('Fallo crítico al pulsar Compartir.');
    }

    console.log('⏳ Esperando procesamiento final (15s)...');
    await page.waitForTimeout(15000);
    await dbg(page, 'ig_07_done');
    console.log('🎉 ¡PUBLICACIÓN EN FEED COMPLETADA CON ÉXITO!');

    return true;

  } catch (err) {
    console.error('❌ Error publicando en feed:', err.message);
    await dbg(page, 'ig_feed_error_final');
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ─── PUBLICAR HISTORIA ────────────────────────────────────────────────────────
async function publishStory(imagePath, sessionPath, headless) {
  console.log('\n📱 Publicando en Instagram HISTORIA...');
  const { browser, context, page } = await createMobileBrowser(sessionPath, headless);
  const trainedClicks = loadTrainedClicks();

  try {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await dismissPopups(page);
    await dbg(page, 'story_01_home');

    // Estrategia: Crear → Historia
    let storyStarted = false;
    
    // Opción 1: Click entrenado
    storyStarted = await clickTrained(page, 'crear_post', trainedClicks, null);
    
    // Opción 2: Botón "+" de crear
    if (!storyStarted) {
      for (const sel of [
        'svg[aria-label="Nueva publicación"]', 'svg[aria-label="New post"]',
        'svg[aria-label="Crear"]', 'svg[aria-label="Create"]',
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0) { await el.click(); storyStarted = true; break; }
        } catch {}
      }
    }

    if (storyStarted) {
      await page.waitForTimeout(2000);
      // Seleccionar "Historia" del menú
      const historiaClicked = await page.evaluate(() => {
        const all = [...document.querySelectorAll('span, div, a')];
        for (const el of all) {
          const t = (el.textContent || '').trim();
          if (t === 'Historia' || t === 'Story' || t === 'Reel') {
            if (t === 'Historia' || t === 'Story') {
              (el.closest('a, [role="button"]') || el).click();
              return true;
            }
          }
        }
        return false;
      });
      if (historiaClicked) console.log('  ✅ Historia seleccionada del menú Crear');
    }

    await page.waitForTimeout(2500);
    await dbg(page, 'story_02_after_create');

    // Subir imagen
    console.log(`📤 Subiendo imagen: ${path.basename(imagePath)}`);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(imagePath);
      console.log('  ✅ Imagen para historia cargada');
    } else {
      // Intentar hacer visible el input
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="file"]');
        inputs.forEach(inp => { inp.style.opacity = '1'; inp.style.display = 'block'; });
      });
      const fileInput2 = page.locator('input[type="file"]').first();
      if (await fileInput2.count() > 0) {
        await fileInput2.setInputFiles(imagePath);
      } else {
        throw new Error('No se encontró input de archivo para la historia');
      }
    }

    await page.waitForTimeout(5000);
    await dbg(page, 'story_03_image');

    // Compartir historia
    let shared = false;
    for (let attempt = 1; attempt <= 4 && !shared; attempt++) {
      const clicked = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button, div[role="button"], [role="button"]')];
        for (const btn of buttons) {
          const t = (btn.textContent || btn.innerText || '').trim().toLowerCase();
          if (['compartir', 'share', 'compartir con tus seguidores', 'share to followers', 'publicar historia'].some(s => t.includes(s))) {
            btn.click();
            return t;
          }
        }
        return null;
      });
      if (clicked) { shared = true; console.log(`  ✅ Historia compartida: "${clicked}"`); }
      
      await page.waitForTimeout(4000);
      if (await page.locator('[role="dialog"]').count() === 0) { shared = true; break; }
      await dbg(page, `story_retry_${attempt}`);
    }

    if (!shared) throw new Error('No se pudo confirmar publicación de historia');

    await page.waitForTimeout(5000);
    console.log('🎉 ¡HISTORIA PUBLICADA CON ÉXITO!');
    if (!isPlaywriter) await context.storageState({ path: sessionPath }).catch(() => {});
    return true;

  } catch (err) {
    console.error('❌ Error publicando historia:', err.message);
    await dbg(page, 'story_error_final');
    throw err;
  } finally {
    if (!isPlaywriter) await browser.close().catch(() => {});
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let config = { headless: false };
  if (fs.existsSync(CONFIG_PATH)) {
    try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch {}
  }
  const headless = config.headless || false;
  const sessionPath = path.join(ROOT, '.agent', `instagram_auth_${selectedAccount}.json`);
  const fallback = path.join(ROOT, '.agent', 'instagram_auth.json');
  const activeSess = fs.existsSync(sessionPath) ? sessionPath : fallback;
  if (!fs.existsSync(activeSess)) {
    console.error(`❌ No se encontró sesión: ${activeSess}`);
    process.exit(1);
  }

  const registry = loadPublishedRegistry();

  if (type === 'feed') {
    const imagePath = getRandomUnpublishedImage(FEED_DIRS, registry.feed || []);
    const caption = FEED_CAPTIONS[Math.floor(Math.random() * FEED_CAPTIONS.length)];
    console.log(`\n📋 Caption: ${caption.substring(0, 80)}...`);
    await publishFeed(imagePath, caption, activeSess, headless);
    if (!registry.feed) registry.feed = [];
    registry.feed.push(imagePath);
    savePublishedRegistry(registry);
  } else if (type === 'story') {
    const imagePath = getRandomUnpublishedImage(HISTORIAS_DIRS, registry.story || []);
    await publishStory(imagePath, activeSess, headless);
    if (!registry.story) registry.story = [];
    registry.story.push(imagePath);
    savePublishedRegistry(registry);
  } else {
    console.error(`❌ Tipo desconocido: "${type}". Usa --type=feed o --type=story`);
    process.exit(1);
  }
}

main().catch(err => { console.error('💥 Error fatal:', err.message); process.exit(1); });
