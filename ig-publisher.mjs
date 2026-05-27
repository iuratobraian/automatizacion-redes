import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium, devices } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.agent', 'ig-config.json');

// Variables globales de ejecución
let args = {};
let type = 'feed';
let imagePath = '';
let caption = '¡Mentalidad de Trading! 🚀 #tradeshare #trading #forex';
let resolvedImagePath = '';

function parseArgs() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '');
      if (arg.includes('=')) {
        const [k, ...v] = arg.split('=');
        args[k.replace('--', '')] = v.join('=');
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i++; // saltar el valor
      } else {
        args[key] = true;
      }
    }
  }

  type = args.type || 'feed';
  imagePath = args.image;
  caption = args.caption || '¡Mentalidad de Trading! 🚀 #tradeshare #trading #forex';

  if (!imagePath || !fs.existsSync(path.resolve(imagePath))) {
    console.error('❌ Error: Falta --image o el archivo no existe.');
    process.exit(1);
  }

  resolvedImagePath = path.resolve(imagePath);
}

const IPHONE_DEVICE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 430, height: 932 },
  screen: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
};

const DESKTOP_DEVICE = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  screen: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false
};

let selectedAccount = 'braiurato';
let activeSessionPath = '';

async function runPublisher() {
  console.log(`🚀 Publicador Instagram (iPhone 14 Pro Max) - Tipo: ${type.toUpperCase()}`);

  let config = { headless: false };
  if (fs.existsSync(CONFIG_PATH)) {
    try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) {}
  }

  selectedAccount = args.account || config.selectedAccount || process.env.IG_ACCOUNT || 'braiurato';
  const sessionPath = path.join(ROOT, '.agent', `instagram_auth_${selectedAccount}.json`);
  const fallbackSessionPath = path.join(ROOT, '.agent', 'instagram_auth.json');
  activeSessionPath = fs.existsSync(sessionPath) ? sessionPath : fallbackSessionPath;

  if (!fs.existsSync(activeSessionPath)) {
    console.error(`❌ No hay sesión para @${selectedAccount}.`);
    process.exit(1);
  }

  console.log(`🔑 Cuenta: @${selectedAccount} | Sesión: ${activeSessionPath}`);

  if (type === 'story') {
    await publishStory(activeSessionPath, config.headless);
  } else {
    await publishFeed(activeSessionPath, config.headless);
  }
}

let isPlaywriterUsed = false;

async function createMobileBrowser(sessionPath, headless) {
  let browser;
  let context;
  let page;
  
  isPlaywriterUsed = false;
  console.log('📱 Levantando Chromium local dedicado en modo MOBILE (iPhone 14 Pro Max)...');
  
  browser = await localChromium.launch({
    headless: headless === true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage']
  });
  context = await browser.newContext({
    ...IPHONE_DEVICE,
    storageState: sessionPath,
    locale: 'es-AR',
    permissions: ['geolocation']
  });
  page = await context.newPage();
  
  return { browser, context, page };
}

async function createDesktopBrowser(sessionPath, headless) {
  let browser;
  let context;
  let page;
  
  try {
    console.log('🔗 [DESKTOP] Intentando conectar a Playwriter (Puerto 19988)...');
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriterUsed = true;
    console.log('✅ ¡Conectado a Playwriter en modo DESKTOP!');
    context = browser.contexts()[0];
    page = await context.newPage();
  } catch (e) {
    console.warn(`⚠️ Conexión a Playwriter falló (${e.message}). Levantando local Chromium con sesión de respaldo...`);
    browser = await localChromium.launch({
      headless: headless === true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    context = await browser.newContext({
      ...DESKTOP_DEVICE,
      storageState: sessionPath,
      locale: 'es-AR',
      permissions: ['geolocation']
    });
    page = await context.newPage();
  }
  
  return { browser, context, page };
}


// Cerrar TODOS los popups persistentes de Instagram y guardar el estado
async function dismissAllPopups(page, context) {
  await page.waitForTimeout(2000);

  // Lista completa de botones de popups conocidos
  const popupTexts = [
    'Activar',           // "La pestaña de mensajes tiene un nuevo diseño"
    'Aceptar',           // Variante del anterior
    'Ahora no',          // "Guardar información de inicio de sesión"
    'Not Now',           // Inglés
    'Guardar información', // Guardar sesión
    'Guardar',           // Variante
    'Cancelar',          // Cerrar diálogos
  ];

  for (const text of popupTexts) {
    try {
      const btn = page.locator(`button:has-text("${text}"), div[role="button"]:has-text("${text}")`);
      if (await btn.count() > 0) {
        await btn.first().click();
        await page.waitForTimeout(1200);
        console.log(`🔇 Popup "${text}" cerrado.`);
      }
    } catch (e) {}
  }

  // Cerrar banner "Usar app" (X)
  try {
    const xBtn = page.locator('svg[aria-label="Cerrar"], svg[aria-label="Close"]');
    if (await xBtn.count() > 0) {
      await xBtn.first().click();
      await page.waitForTimeout(800);
      console.log('🔇 Banner "Usar app" cerrado.');
    }
  } catch (e) {}

  // Guardar storageState actualizado para que los popups no vuelvan a aparecer
  try {
    if (!isPlaywriterUsed) {
      await context.storageState({ path: activeSessionPath });
      console.log('💾 Estado de sesión actualizado (popups no volverán).');
    }
  } catch (e) {
    console.warn('⚠️ No se pudo guardar storageState:', e.message);
  }
}

async function debugScreenshot(page, name) {
  const filePath = path.join(ROOT, 'public', 'generated_posts', `debug_${name}.png`);
  await page.screenshot({ path: filePath }).catch(() => {});
  console.log(`📸 [Debug] ${name}`);
}

async function clickShareButton(page) {
  console.log('🚀 Publicando — buscando botón "Compartir"...');
  
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`  🔄 Intento ${attempt}/${MAX_RETRIES}...`);
    
    // Esperar que el botón no esté deshabilitado (IG lo deshabilita mientras procesa)
    try {
      await page.waitForFunction(() => {
        const els = [...document.querySelectorAll('div[role="dialog"] button, div[role="dialog"] div[role="button"]')];
        const shareBtn = els.find(el => {
          const text = (el.textContent || '').trim().toLowerCase();
          return text === 'compartir' || text === 'share' || text === 'publicar';
        });
        return shareBtn && shareBtn.getAttribute('aria-disabled') !== 'true' && shareBtn.offsetParent !== null;
      }, { timeout: 15000 });
    } catch (e) {
      console.log('  ⚠️ Timeout esperando que el botón se habilite o se detecte.');
    }

    // Esperar un momento para que IG termine de procesar
    await page.waitForTimeout(2000);

    let clicked = false;

    // ESTRATEGIA 0: Elemento pinneado por Playwriter (Playwriter Pinned Elem)
    try {
      console.log('  🎯 Probando si existe el botón pinneado globalThis.playwriterPinnedElem1 en el navegador...');
      const hasPinned = await page.evaluate(() => {
        if (globalThis.playwriterPinnedElem1) {
          globalThis.playwriterPinnedElem1.click();
          return true;
        }
        return false;
      });
      if (hasPinned) {
        console.log('  ✅ Click exitoso en el elemento pinneado globalThis.playwriterPinnedElem1!');
        clicked = true;
        await page.waitForTimeout(5000);
      }
    } catch (e) {
      console.log(`  ⚠️ Falló click en elemento pinneado: ${e.message}`);
    }

    // ESTRATEGIA 1: Teclado nativo (10x Tab + Enter) de forma exacta y consecutiva
    if (!clicked) {
      try {
        console.log('  ⌨️ Intentando estrategia de teclado nativo (11x Tab + Enter) desde el editor...');
        const textEditor = page.locator('div[role="dialog"] textarea, div[role="dialog"] div[role="textbox"], div[role="dialog"] div[contenteditable="true"]').first();
        if (await textEditor.count() > 0) {
          // Asegurar foco cliqueando fuertemente en el editor
          await textEditor.focus({ timeout: 2000 }).catch(() => {});
          await textEditor.click({ force: true, timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(800);
          
          // Presionar exactamente 11 veces Tab
          console.log('  ⌨️ Enviando 11 pulsaciones de Tab...');
          for (let t = 0; t < 11; t++) {
            await page.keyboard.press('Tab');
            await page.waitForTimeout(100); // Tiempo óptimo de procesamiento
          }
          await page.waitForTimeout(600);
          
          // Presionar Enter para enviar la publicación
          await page.keyboard.press('Enter');
          clicked = true;
          console.log('  ✅ 11x Tab y Enter enviados de forma exacta.');
          await page.waitForTimeout(5000); // Esperar a que comience la subida
        }
      } catch (e) {
        console.log(`  ⚠️ Falló estrategia de teclado nativo: ${e.message}`);
      }
    }

    // ESTRATEGIA 2: JS evaluate — encontrar el div o button con texto "Compartir" o "Share"
    if (!clicked) {
      console.log('  🔧 Intentando via JS evaluate (Compartir/Share button/div)...');
      clicked = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return false;
        
        // Encontrar todos los elementos button y div[role="button"] en el diálogo
        const elements = [...dialog.querySelectorAll('button, div[role="button"], span[role="button"]')];
        const shareBtn = elements.find(el => {
          const text = (el.textContent || el.innerText || '').trim().toLowerCase();
          return text === 'compartir' || text === 'share' || text === 'publicar';
        });
        
        if (shareBtn) {
          // Bypassear el overlay cliqueando directamente por JS
          shareBtn.click();
          return true;
        }
        return false;
      });
      if (clicked) console.log('  ✅ Click exitoso via JS evaluate en el botón "Compartir".');
    }

    // ESTRATEGIA 3: Selectores de texto (español e inglés) via Playwright Click
    if (!clicked) {
      const shareButtonSelectors = [
        'div[role="dialog"] div[role="button"]:has-text("Compartir")',
        'div[role="dialog"] button:has-text("Compartir")',
        'div[role="dialog"] div[role="button"]:has-text("Share")',
        'div[role="dialog"] button:has-text("Share")',
        'button[type="button"]:has-text("Compartir")',
        'button[type="button"]:has-text("Share")',
        'div[role="button"]:has-text("Compartir")',
        'div[role="button"]:has-text("Share")',
      ];

      for (const selector of shareButtonSelectors) {
        try {
          const el = page.locator(selector).last();
          if (await el.isVisible({ timeout: 2000 })) {
            const isDisabled = await el.getAttribute('disabled');
            const ariaDisabled = await el.getAttribute('aria-disabled');
            if (!isDisabled && ariaDisabled !== 'true') {
              await el.scrollIntoViewIfNeeded().catch(() => {});
              await el.click({ timeout: 5000 });
              clicked = true;
              console.log(`  ✅ Click exitoso con selector: ${selector}`);
              break;
            }
          }
        } catch (e) { continue; }
      }
    }

    // ESTRATEGIA 4: Force click en el div/button del dialog
    if (!clicked) {
      console.log('  🔧 Intentando force click por selector de texto...');
      try {
        const fallback = page.locator('div[role="dialog"] div[role="button"]:has-text("Compartir"), div[role="dialog"] button:has-text("Compartir"), div[role="dialog"] div[role="button"]:has-text("Share"), div[role="dialog"] button:has-text("Share")').last();
        await fallback.click({ force: true, timeout: 5000 });
        clicked = true;
        console.log('  ✅ Click exitoso via force click en selector.');
      } catch (e) {}
    }

    if (!clicked) {
      console.log(`  ❌ No se pudo hacer click en intento ${attempt}.`);
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        console.log(`  ⏳ Esperando ${delay / 1000}s antes del próximo intento...`);
        await page.waitForTimeout(delay);
      }
      continue;
    }

    // Verificar que el post se publicó
    let published = false;
    try {
      await page.waitForSelector('div:has-text("Tu publicación ha sido compartida"), div:has-text("compartió"), div:has-text("shared"), div:has-text("Your post has been shared")', { timeout: 20000 });
      console.log('✅ Post de Instagram publicado exitosamente');
      published = true;
    } catch (e) {
      try {
        // Verificar si el dialog se cerró (indica publicación exitosa)
        await page.waitForFunction(() => {
          return !document.querySelector('div[role="dialog"]');
        }, { timeout: 15000 });
        console.log('✅ Post publicado (modal cerrado)');
        published = true;
      } catch (err) {}
    }
    
    if (published) return true;
    
    // Si llegamos aquí, el click se hizo pero no se confirmó la publicación
    console.log(`  ⚠️ Click realizado pero no se confirmó la publicación. Reintentando...`);
    if (attempt < MAX_RETRIES) {
      await page.waitForTimeout(3000);
    }
  }
  
  console.log('❌ No se pudo publicar después de todos los intentos.');
  return false;
}

async function navigateIGPostWizard(page, caption) {
  console.log('➡️ Avanzando en el asistente (Siguiente / Next)...');
  
  for (let step = 1; step <= 3; step++) {
    await page.waitForTimeout(2000);
    
    // Si aparece el botón Compartir o el campo de caption, salir
    const shareVisible = await page.locator('div[role="dialog"] button:has-text("Compartir"), div[role="dialog"] button:has-text("Share"), div[role="dialog"] div[role="button"]:has-text("Compartir"), div[role="dialog"] div[role="button"]:has-text("Share")').isVisible().catch(() => false);
    if (shareVisible) {
      console.log('  ✨ Botón Compartir / Share ya visible, deteniendo avance.');
      break;
    }

    // ESTRATEGIA A: evaluate directo (más robusto contra overlays de Instagram)
    const nextClicked = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return false;
      const buttons = [...dialog.querySelectorAll('button, div[role="button"], span[role="button"]')];
      const next = buttons.find(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        return t === 'siguiente' || t === 'next';
      });
      if (next) {
        next.click();
        return true;
      }
      return false;
    });

    if (nextClicked) {
      console.log(`  ✅ Siguiente (Paso ${step}) via evaluate click.`);
      await page.waitForTimeout(2500);
    } else {
      // ESTRATEGIA B: Fallback con page.locator de Playwright
      let nextFoundFallback = false;
      const nextButtonSelectors = [
        'div[role="dialog"] button:has-text("Siguiente")',
        'div[role="dialog"] button:has-text("Next")',
        'div[role="dialog"] div[role="button"]:has-text("Siguiente")',
        'div[role="dialog"] div[role="button"]:has-text("Next")',
      ];
      for (const sel of nextButtonSelectors) {
        try {
          const btn = page.locator(sel).last();
          if (await btn.isVisible({ timeout: 1500 })) {
            await btn.click({ force: true, timeout: 2000 });
            nextFoundFallback = true;
            console.log(`  ✅ Siguiente (Paso ${step}) via locator click fallback (${sel}).`);
            await page.waitForTimeout(2500);
            break;
          }
        } catch (e) {}
      }
      
      if (!nextFoundFallback) {
        console.log(`  ⚠️ No se encontró botón Siguiente/Next en el paso ${step}.`);
        break;
      }
    }
  }

  await debugScreenshot(page, 'feed_05_caption');

  // Escribir caption antes de compartir
  console.log('📝 Escribiendo caption...');
  let captionFilled = false;
  
  // Intentar usando playwright standard (con selectores restringidos al diálogo)
  for (const sel of ['div[role="dialog"] textarea', 'div[role="dialog"] div[role="textbox"]', 'div[role="dialog"] div[contenteditable="true"]']) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.click();
        await page.waitForTimeout(500);
        await el.fill(caption);
        captionFilled = true;
        console.log('  ✅ Caption escrita.');
        break;
      }
    } catch (e) {}
  }

  // Fallback con evaluate directo por si falla el fill de playwright (por overlays)
  if (!captionFilled) {
    console.log('  🔧 Intentando escribir caption via evaluate...');
    captionFilled = await page.evaluate((text) => {
      const editor = document.querySelector('div[role="dialog"] textarea, div[role="dialog"] div[role="textbox"], div[role="dialog"] div[contenteditable="true"]');
      if (editor) {
        if (editor.tagName.toLowerCase() === 'textarea') {
          editor.value = text;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          editor.textContent = text;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      }
      return false;
    }, caption);
    if (captionFilled) console.log('  ✅ Caption escrita via evaluate.');
  }

  await page.waitForTimeout(1500);
  await debugScreenshot(page, 'feed_06_before_share');
  
  // Ahora sí, hacer click en Compartir
  return await clickShareButton(page);
}

// ═══════════════════════════════════════════════════════════════
// 📌 PUBLICAR EN EL FEED
// ═══════════════════════════════════════════════════════════════
async function publishFeed(sessionPath, headless) {
  console.log('🖥️ Feed: Iniciando (Escritorio)...');
  const { browser, context, page } = await createDesktopBrowser(sessionPath, headless);

  try {
    console.log('🤖 Navegando a Instagram (escritorio)...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    await dismissAllPopups(page, context);
    await debugScreenshot(page, 'feed_01_home');

    // PASO 1: Botón CREAR en barra lateral de escritorio
    console.log('➕ Buscando botón Crear...');
    let createClicked = false;

    // Estrategia A: aria-label SVG (inglés y español)
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

    // Estrategia B: span con texto en el nav lateral
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

    // Estrategia C: getByRole link
    if (!createClicked) {
      try {
        const byRole = page.getByRole('link', { name: /crear|create|nueva publicación|new post/i }).first();
        if (await byRole.count() > 0) {
          await byRole.click();
          createClicked = true;
          console.log('  ✅ Crear por getByRole link');
        }
      } catch {}
    }

    if (!createClicked) {
      await debugScreenshot(page, 'feed_crear_notfound');
      throw new Error('No se pudo encontrar el botón Crear. Revisa debug screenshot.');
    }

    await page.waitForTimeout(2500);
    await debugScreenshot(page, 'feed_02_after_crear');

    // PASO 2: Clic en "Publicación" — usar JS directo porque el overlay de IG bloquea clicks
    console.log('📋 Buscando opción "Publicación"...');
    let modalOpened = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Estrategia JS: encontrar el elemento "Publicación" y hacer click nativo
      const clicked = await page.evaluate(() => {
        // Buscar en spans y divs
        const allEls = [...document.querySelectorAll('span, div[role="button"], a')];
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (text === 'Publicación' || text === 'Post') {
            // Click en el elemento más cercano que sea interactivo
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

      // Verificar si hay un dialog/modal abierto (el modal de crear tiene role="dialog")
      const hasDialog = await page.locator('[role="dialog"]').count();
      if (hasDialog > 0) {
        console.log(`  ✅ Dialog detectado, buscando input file dentro...`);
        // El input puede estar oculto — inyectar uno si no existe
        const fileCount = await page.locator('[role="dialog"] input[type="file"]').count();
        if (fileCount > 0) {
          modalOpened = true;
          break;
        }
      }

      // Si no apareció, volver a clickear Crear
      console.log(`  ⚠️ Modal no detectado. Reintentando Crear + Publicación (${attempt + 2}/3)...`);
      for (const sel of [
        'svg[aria-label="Nueva publicación"]', 'svg[aria-label="New post"]',
        'svg[aria-label="Crear"]', 'svg[aria-label="Create"]',
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0) { await el.click(); break; }
        } catch {}
      }
      await page.waitForTimeout(2500);
    }
    await debugScreenshot(page, 'feed_02b_modal');

    if (!modalOpened) {
      throw new Error('No se pudo abrir el modal de subida después de 3 intentos.');
    }

    // PASO 3: Subir imagen
    console.log('📥 Subiendo imagen...');
    await page.locator('input[type="file"]').last().setInputFiles(resolvedImagePath);
    console.log('  ✅ Imagen cargada.');
    await page.waitForTimeout(5000);
    await debugScreenshot(page, 'feed_03_image');

    // PASO 4: Relación de aspecto (intentar seleccionar Original)
    console.log('🔲 Buscando aspecto...');
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

    const shared = await navigateIGPostWizard(page, caption);

    if (!shared) {
      console.log('  ❌ No se pudo confirmar el envío tras múltiples intentos.');
      await debugScreenshot(page, 'feed_share_failed_final');
      throw new Error('Fallo crítico al pulsar Compartir.');
    }

    // Esperar a que IG procese (puede tardar en video o carrusel)
    console.log('⏳ Esperando procesamiento final (15s)...');
    await page.waitForTimeout(15000);
    await debugScreenshot(page, 'feed_07_done');

    // Guardar storageState final
    try {
      if (!isPlaywriterUsed) {
        await context.storageState({ path: activeSessionPath });
        console.log('💾 Sesión guardada.');
      }
    } catch (e) {}

    // PASO 8: Obtener URL del post y registrarla para monitoreo automático
    console.log('🔗 Buscando enlace del post publicado...');
    try {
      // 1. Intentar autodetectar qué cuenta está activa en este momento
      let loggedInUser = selectedAccount;
      try {
        const detectedHref = await page.evaluate(() => {
          const links = [...document.querySelectorAll('a[href]')];
          
          // Buscar enlace que tenga texto "perfil" o "profile" en el menú/sidebar
          const profileLink = links.find(a => {
            const t = a.textContent.toLowerCase();
            return t.includes('perfil') || t.includes('profile');
          });
          if (profileLink) return profileLink.getAttribute('href');

          // Fallback: buscar el enlace de perfil del avatar o similar
          const reserved = ['explore', 'reels', 'direct', 'stories', 'accounts', 'legal', 'about', 'privacy', 'help', 'press', 'api', 'emails'];
          for (const link of links) {
            const hrefVal = link.getAttribute('href') || '';
            const match = hrefVal.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
            if (match) {
              const username = match[1];
              if (!reserved.includes(username.toLowerCase())) {
                return hrefVal;
              }
            }
          }
          return null;
        });

        if (detectedHref) {
          loggedInUser = detectedHref.replace(/\//g, '');
          console.log(`👤 Cuenta activa autodetectada en tiempo de ejecución: @${loggedInUser}`);
        }
      } catch (detectErr) {
        console.log(`⚠️ No se pudo autodetectar la cuenta activa: ${detectErr.message}`);
      }

      // 2. Navegar al perfil correcto y extraer el primer post publicado
      await page.goto(`https://www.instagram.com/${loggedInUser}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const firstPost = page.locator('a[href*="/p/"]').first();
      if (await firstPost.count() > 0) {
        const href = await firstPost.getAttribute('href');
        const postUrl = `https://www.instagram.com${href}`;
        console.log(`🎯 Enlace del post: ${postUrl}`);
        updateVault({ instagramFeedUrl: postUrl });

        // ★ AUTO-REGISTRAR en .agent/monitored_posts.json para que el daemon lo vigile automáticamente
        const monitoredPath = path.join(ROOT, '.agent', 'monitored_posts.json');
        let monitoredData = { posts: [], profiles: ['tradeshare.ok', 'braiurato'] };
        try {
          const raw = fs.readFileSync(monitoredPath, 'utf-8');
          monitoredData = JSON.parse(raw);
          if (!Array.isArray(monitoredData.posts)) monitoredData.posts = [];
          if (!Array.isArray(monitoredData.profiles)) monitoredData.profiles = ['tradeshare.ok', 'braiurato'];
        } catch {}
        const normalized = postUrl.replace(/\/+$/, '') + '/';
        if (!monitoredData.posts.some(p => p.replace(/\/+$/, '/') === normalized)) {
          monitoredData.posts.push(normalized);
          fs.writeFileSync(monitoredPath, JSON.stringify(monitoredData, null, 2));
          console.log(`📌 Post registrado automáticamente para monitoreo: ${normalized}`);
        }
      }
    } catch (e) {
      console.warn('⚠️ No se pudo extraer enlace:', e.message);
    }


    console.log('🎉 ¡Feed completado!');
  } catch (err) {
    console.error('❌ Error Feed:', err.message);
    await debugScreenshot(page, 'feed_error');
  } finally {
    if (browser) {
      if (isPlaywriterUsed) {
        console.log('🔌 Desconectando de Playwriter (dejando el navegador real abierto)...');
        await browser.close().catch(() => {});
      } else {
        await browser.close().catch(() => {});
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 📌 PUBLICAR EN HISTORIAS
// ═══════════════════════════════════════════════════════════════
async function publishStory(sessionPath, headless) {
  console.log('📱 Historia: Iniciando (iPhone 14 Pro Max)...');
  const { browser, context, page } = await createMobileBrowser(sessionPath, headless);

  try {
    console.log('🤖 Navegando a Instagram móvil...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    await dismissAllPopups(page, context);

    // PASO 1: Clic en "Tu historia"
    console.log('📸 Clic en "Tu historia"...');
    const storyBubble = page.locator('span:has-text("Tu historia")').first();
    if (await storyBubble.count() > 0) {
      await storyBubble.click();
      console.log('  ✅ "Tu historia" encontrado.');
    } else {
      console.log('  ⚠️ Tocando primera burbuja...');
      await page.touchscreen.tap(100, 130);
    }
    await page.waitForTimeout(3000);

    // PASO 2: Subir imagen
    console.log('📥 Subiendo imagen...');
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(resolvedImagePath);
      console.log('  ✅ Imagen cargada.');
    } else {
      throw new Error('No se encontró input de archivo.');
    }
    await page.waitForTimeout(8000);
    await debugScreenshot(page, 'story_02_preview');

    // PASO 3: "Compartir historia" — puede ser botón o texto
    console.log('🚀 Publicando historia...');
    let shared = false;
    
    // Intentar selectores
    for (const sel of [
      'div[role="button"]:has-text("Compartir historia")',
      'button:has-text("Compartir historia")',
      'span:has-text("Compartir historia")'
    ]) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          shared = true;
          console.log(`  ✅ Compartida con: ${sel}`);
          break;
        }
      } catch (e) {}
    }

    // Fallback: getByText
    if (!shared) {
      try {
        const shareBtn = page.getByText('Compartir historia', { exact: true }).first();
        if (await shareBtn.count() > 0) {
          await shareBtn.click();
          shared = true;
          console.log('  ✅ Compartida via getByText.');
        }
      } catch (e) {}
    }

    // Fallback final: tap en la posición del botón (centro inferior)
    if (!shared) {
      console.log('  🎯 Toque en coordenada (215, 900)...');
      await page.touchscreen.tap(215, 900);
    }

    console.log('⏳ Esperando (15s)...');
    await page.waitForTimeout(15000);
    await debugScreenshot(page, 'story_03_done');

    // Guardar storageState
    try {
      if (!isPlaywriterUsed) {
        await context.storageState({ path: activeSessionPath });
      }
    } catch (e) {}

    console.log('🎉 ¡Historia publicada!');
    updateVault({ instagramStoryPosted: true });
  } catch (err) {
    console.error('❌ Error Historia:', err.message);
    await debugScreenshot(page, 'story_error');
  } finally {
    if (browser) {
      if (isPlaywriterUsed) {
        console.log('🔌 Desconectando de Playwriter (dejando el navegador real abierto)...');
        await browser.close().catch(() => {});
      } else {
        await browser.close().catch(() => {});
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
function localStorageGet(key) {
  try {
    const filePath = path.join(ROOT, '.agent', 'local_storage_cache.json');
    if (fs.existsSync(filePath)) {
      const db = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return db[key];
    }
  } catch (e) {}
  return null;
}

function updateVault(data) {
  try {
    const vaultPath = path.join(ROOT, '.agent', 'marketing_vault.json');
    if (fs.existsSync(vaultPath)) {
      const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      if (vault.length > 0) {
        let index = -1;
        if (args.id) {
          index = vault.findIndex(p => p.id === args.id);
        }
        if (index === -1) {
          index = vault.length - 1; // Fallback
        }
        vault[index] = { ...vault[index], ...data };
        fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
        console.log('💾 Bóveda actualizada para post:', vault[index].id, data);
      }
    }
  } catch (e) {
    console.error('⚠️ Error bóveda:', e.message);
  }
}

export async function publishToIG(imagePathIn, captionIn, typeIn = 'feed', accountIn = 'braiurato', idIn = null) {
  args = {
    image: imagePathIn,
    caption: captionIn,
    type: typeIn,
    account: accountIn,
    id: idIn
  };
  type = typeIn;
  imagePath = imagePathIn;
  caption = captionIn;
  resolvedImagePath = path.resolve(imagePath);
  
  await runPublisher();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  parseArgs();
  runPublisher();
}
