/**
 * arena-generator.mjs — Generador de Imágenes de Alta Calidad con Arena.ai V1
 * Genera 2 imágenes por prompt en arena.ai — duplicando el volumen de contenido diario.
 * 
 * URL: https://arena.ai/c/019e6960-0c5b-7b37-b168-bf8901592307
 * 
 * Uso:
 *   node automatizacion-redes/arena-generator.mjs --topic="tu tema" --publish=false
 *   node automatizacion-redes/arena-generator.mjs  (usa prompt rotativo)
 */

import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getRotatingPrompt, getRotatingTopicAndAngle, getCaptionForPrompt } from './prompt-library.js';
import logger from './utils/logger.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORAGE_STATE = path.join(ROOT, '.agent', 'arena_auth.json');
const CONFIG_PATH = path.join(ROOT, '.agent', 'ig-config.json');
const ARENA_URL = 'https://arena.ai/c/019e6960-0c5b-7b37-b168-bf8901592307';
const FEED_DIR = path.join(ROOT, 'public', 'images', 'feed');

// Leer argumentos
const args = {};
process.argv.slice(2).forEach(arg => {
  const [key, ...rest] = arg.split('=');
  const value = rest.join('=');
  if (key && value) {
    args[key.replace('--', '')] = value;
  } else if (arg.startsWith('--')) {
    args[arg.replace('--', '')] = true;
  }
});

// Helper: registrar imagen en la Bóveda
function registerInVault(imageUrl, caption, source = 'arena') {
  const vaultPath = path.join(ROOT, '.agent', 'marketing_vault.json');
  let vault = [];
  if (fs.existsSync(vaultPath)) {
    try { vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8')); } catch { vault = []; }
  }
  const entry = {
    id: `arena_${Date.now()}`,
    imagenUrl: imageUrl,
    imageUrl: imageUrl,
    copy: caption,
    caption: caption,
    frase: caption.substring(0, 80),
    title: caption.substring(0, 60),
    source,
    createdAt: new Date().toISOString()
  };
  vault.unshift(entry);
  fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
  console.log(`💾 Registrado en marketing_vault.json: ${imageUrl}`);
  return entry;
}

// Helper: descargar imagen desde URL a disco
async function downloadImage(page, imageUrl, fileName) {
  try {
    if (!fs.existsSync(FEED_DIR)) {
      fs.mkdirSync(FEED_DIR, { recursive: true });
    }
    const targetPath = path.join(FEED_DIR, fileName);

    // Intentar descargar con fetch desde el contexto del navegador
    const base64 = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        return null;
      }
    }, imageUrl);

    if (base64) {
      fs.writeFileSync(targetPath, Buffer.from(base64, 'base64'));
      console.log(`✅ Imagen guardada en: ${targetPath}`);
      return targetPath;
    }
  } catch (err) {
    console.error(`❌ Error descargando imagen ${imageUrl}: ${err.message}`);
  }
  return null;
}

// Helper: esperar a que aparezcan imágenes generadas en Arena (filtrando las preexistentes)
async function waitForGeneratedImages(page, ignoredUrls = [], timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(5000);

    const images = await page.evaluate((ignored) => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const generated = imgs.filter(img => {
        const src = img.src || '';
        if (ignored.includes(src)) return false;
        // Arena sirve las imágenes desde cdn.arena.ai o similares
        return (
          src.includes('cdn.arena') ||
          src.includes('arena.ai') ||
          src.includes('imagedelivery') ||
          src.includes('oaidalleapiprodscus') ||
          img.getAttribute('data-generated') === 'true' ||
          // También buscar las imágenes que son cuadradas y grandes (generadas)
          (img.naturalWidth > 400 && img.naturalHeight > 400 && !src.includes('avatar') && !src.includes('logo'))
        );
      });
      return generated.map(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight }));
    }, ignoredUrls);

    if (images.length >= 1) {
      console.log(`🎨 Se detectaron ${images.length} imagen(es) generada(s) nueva(s) en Arena.`);
      return images;
    }

    console.log(`⏳ Esperando imágenes nuevas... (${Math.round((Date.now() - start) / 1000)}s)`);
  }
  console.warn('⚠️ Timeout esperando imágenes nuevas de Arena.ai.');
  return [];
}

async function generatePost() {
  console.log('🤖 Iniciando Generador de Imágenes con Arena.ai...');
  let success = true;



  // 1. Obtener tema
  let selectedTopicText = '';
  let selectedAngleInstruction = '';
  const selectedStyle = getRotatingPrompt();

  if (args.topic) {
    selectedTopicText = args.topic;
    selectedAngleInstruction = 'Genera el copy de forma directa y persuasiva.';
    console.log(`🎯 Contenido por Parámetro: ${selectedTopicText}`);
  } else {
    const { topic, angle } = getRotatingTopicAndAngle();
    selectedTopicText = topic.desc;
    selectedAngleInstruction = angle.instruccion;
    console.log(`🎯 Tema rotativo: "${topic.tema}"`);
  }

  // 2. Calcular caption listo para publicar
  const caption = getCaptionForPrompt(selectedTopicText) || `⚡ Trading inteligente con TradeShare. Bitácora automatizada conectada a MT5. Únete a la comunidad premium. trade-share.com #trading #tradeshare`;

  let browser;
  let context;
  let page;
  let isPlaywriter = false;

  let headless = true;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      headless = config.headless !== undefined ? config.headless : true;
    }
  } catch {}
  if (args.headful) headless = false;
  if (args.headless) headless = true;

  // 3. Conectar al navegador via Playwriter o local
  try {
    console.log('🔗 Conectando a Playwriter...');
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    console.log('✅ ¡Conectado a Playwriter exitosamente!');
    context = browser.contexts()[0];

    const pages = context.pages();
    page = pages.find(p => p.url().includes('arena.ai'));
    if (!page) {
      page = await context.newPage();
    } else {
      console.log('🔄 Reutilizando pestaña existente de Arena.ai.');
    }
  } catch (e) {
    console.warn(`⚠️ Conexión a Playwriter falló (${e.message}). Usando navegador local...`);

    if (!fs.existsSync(STORAGE_STATE)) {
      console.error('❌ No se encontró sesión de Arena.ai. Corre "node automatizacion-redes/arena-auth.mjs" primero.');
      process.exit(1);
    }

    browser = await localChromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security'
      ]
    });
    context = await browser.newContext({
      storageState: STORAGE_STATE,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }
    });
    page = await context.newPage();
  }

  const generatedImages = [];

  try {
    // 4. Navegar a Arena.ai
    console.log(`🌐 Navegando a Arena.ai: ${ARENA_URL}`);
    await page.goto(ARENA_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    // Cerrar modales de bienvenida si existen
    const closeSelectors = [
      'button:has-text("Close")',
      'button:has-text("Cerrar")',
      '[aria-label="Close"]',
      'button:has-text("Got it")',
      'button:has-text("OK")',
      'button:has-text("Dismiss")',
      'button:has-text("Save Preferences")',
      'button:has-text("Save")',
      'button:has-text("Accept All")',
      'button:has-text("Aceptar todo")',
      'button:has-text("Aceptar")',
      'button:has-text("Manage Cookie Preferences")'
    ];
    for (const sel of closeSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          await page.waitForTimeout(1000);
        }
      } catch {}
    }

    // 5. Construir el prompt de imagen
    const imagePrompt = `Create a premium, hyper-realistic trading lifestyle image (1:1 square format) for the Instagram feed of a professional trading education platform called TradeShare.

Theme: ${selectedTopicText}
Visual style: ${selectedStyle}

Requirements:
- No unrealistic elements (no lightning bolts, no futuristic HUDs unless subtle)
- Subtle inclusion of "www.trade-share.com" text
- Premium aesthetic: warm/cool indirect lighting, clean desk or modern workspace
- Focus on discipline, professionalism, and real trading lifestyle
- High quality, photorealistic, publishable on social media

Please generate 2 image variations of this concept.`;

    // Obtener lista de imágenes ya existentes para ignorarlas en la espera
    const ignoredUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.map(img => img.src).filter(Boolean);
    });
    console.log(`🔍 Se encontraron ${ignoredUrls.length} imágenes preexistentes en el chat. Serán ignoradas.`);

    console.log('🎨 Enviando prompt a Arena.ai...');

    // 6. Buscar el input de chat y escribir el prompt
    const inputSelectors = [
      'textarea',
      'div[contenteditable="true"]',
      'div[role="textbox"]',
      '[data-placeholder]',
      'input[type="text"]:not([type="search"])',
      '.chat-input',
      '[placeholder*="message" i]',
      '[placeholder*="prompt" i]'
    ];

    let inputLocated = false;
    for (const sel of inputSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 4000 })) {
          await el.click();
          await page.waitForTimeout(500);
          await el.fill(imagePrompt);
          inputLocated = true;
          console.log(`✅ Input localizado con selector: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!inputLocated) {
      // Fallback: click en el centro inferior y escribir
      const vp = page.viewportSize();
      await page.mouse.click(vp.width / 2, vp.height - 120);
      await page.waitForTimeout(500);
      await page.keyboard.type(imagePrompt);
      console.log('⚠️ Usando fallback de click + type para el input.');
    }

    await page.waitForTimeout(1000);

    // 7. Enviar el prompt (Enter o botón de envío)
    const sendSelectors = [
      'button[type="submit"]',
      'button:has(svg[data-testid*="send"])',
      '[aria-label*="send" i]',
      '[aria-label*="enviar" i]',
      'button:has-text("Send")',
      'button:has-text("Generate")'
    ];

    let sent = false;
    for (const sel of sendSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          sent = true;
          console.log(`📤 Prompt enviado via botón: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!sent) {
      await page.keyboard.press('Enter');
      console.log('📤 Prompt enviado via Enter.');
    }

    // 8. Esperar la generación de imágenes (máx 3 minutos)
    console.log('⏳ Esperando generación de imágenes en Arena.ai (hasta 3 minutos)...');
    const images = await waitForGeneratedImages(page, ignoredUrls, 180000);
    logger.info(`Arena: ${images.length} imagen(es) detectada(s).`);

    if (images.length === 0) {
      // Tomar screenshot de debug
      const debugPath = path.join(ROOT, '.agent', `debug-arena-${Date.now()}.png`);
      await page.screenshot({ path: debugPath, fullPage: true });
      console.log(`📸 Screenshot de debug guardado: ${debugPath}`);
      throw new Error('No se detectaron imágenes generadas por Arena.ai.');
    }

    // 9. Descargar las imágenes generadas (máximo 2)
    const imagesToProcess = images.slice(0, 2);
    console.log(`📥 Descargando ${imagesToProcess.length} imagen(es)...`);

    for (let i = 0; i < imagesToProcess.length; i++) {
      const img = imagesToProcess[i];
      const timestamp = Date.now();
      const fileName = `arena_${timestamp}_${i + 1}.png`;

      const savedPath = await downloadImage(page, img.src, fileName);

      if (savedPath) {
        const serveUrl = `/images/feed/${fileName}`;
        const vaultEntry = registerInVault(serveUrl, caption, 'arena');
        generatedImages.push({ fileName, serveUrl, caption, entry: vaultEntry });
        logger.info(`Arena: Imagen ${i + 1}/2 guardada en vault: ${serveUrl}`);
        console.log(`✅ Imagen ${i + 1}/2 generada y guardada: ${serveUrl}`);
      } else {
        console.warn(`⚠️ No se pudo guardar la imagen ${i + 1}`);
      }

      // Pausa breve entre descargas
      if (i < imagesToProcess.length - 1) {
        await page.waitForTimeout(2000);
      }
    }

    console.log(`🎉 Arena.ai: ${generatedImages.length} imágenes generadas con éxito.`);

    // 10. Publicar localmente si se requiere
    if (args.publish !== 'false' && args.publish !== false && generatedImages.length > 0) {
      const feedPath = path.join(ROOT, '.agent', 'local_portal_feed.json');
      let feed = [];
      if (fs.existsSync(feedPath)) {
        try { feed = JSON.parse(fs.readFileSync(feedPath, 'utf8')); } catch { feed = []; }
      }
      generatedImages.forEach(img => {
        feed.unshift({
          _id: `arena_${Date.now()}`,
          userId: 'local_ai_agent_arena',
          target: 'feed',
          imageUrl: img.serveUrl,
          caption: img.caption,
          title: img.caption.substring(0, 60),
          createdAt: Date.now(),
          categoria: 'Trading',
          isAiAgent: true
        });
      });
      fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), 'utf8');
      console.log('✅ Imágenes registradas en Portal Local Feed.');
    }

  } catch (error) {
    success = false;
    console.error('❌ Error durante la generación con Arena.ai:', error.message);
    try {
      const debugPath = path.join(ROOT, 'public', 'generated_posts', 'debug_arena.png');
      await page.screenshot({ path: debugPath });
      console.log('📸 Captura de depuración guardada en:', debugPath);
    } catch {}
  } finally {
    if (!isPlaywriter && browser) {
      await browser.close().catch(() => {});
    } else if (isPlaywriter && page && !args.keepopen) {
      try {
        await page.close().catch(() => {});
      } catch {}
      if (browser) {
        console.log('🔌 Desconectando de Playwriter CDP...');
        await browser.disconnect().catch(() => {});
      }
    }
  }

  if (success && generatedImages.length > 0) {
    console.log(`SUCCESS: ${generatedImages.length} imagen(es) de Arena.ai generada(s).`);
    generatedImages.forEach(img => console.log(`  - ${img.serveUrl}`));
  } else {
    console.log('FAIL: No se pudo generar imágenes con Arena.ai.');
  }

  process.exit(success && generatedImages.length > 0 ? 0 : 1);
}

generatePost().catch(e => {
  console.error('💥 Error fatal en arena-generator.mjs:', e.message);
  process.exit(1);
});
