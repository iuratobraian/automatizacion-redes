import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getRotatingPrompt, getRotatingTopicAndAngle } from './prompt-library.js';
import { awaitImageGeneration, downloadAndSaveImage } from './utils/imageHelper.js';
import logger from './utils/logger.js';

dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORAGE_STATE = path.join(ROOT, '.agent', 'gemini_auth.json');
const CONFIG_PATH = path.join(ROOT, '.agent', 'ig-config.json');
const VAULT_PATH = path.join(ROOT, '.agent', 'marketing_vault', 'vault_es.json');

// Leer argumentos
const args = {};
process.argv.slice(2).forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    args[key.replace('--', '')] = value;
  } else if (arg.startsWith('--')) {
    args[arg.replace('--', '')] = true;
  }
});

// Helper: Guardar en Feed Local (Simulador de Portal TradeShare)
function addToLocalPortalFeed(target, imageUrl, caption, userId) {
  const feedPath = path.join(ROOT, '.agent', 'local_portal_feed.json');
  let feed = [];
  if (fs.existsSync(feedPath)) {
    try {
      feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    } catch (e) {
      feed = [];
    }
  }

  const postId = `local_${Date.now()}`;
  const entry = {
    _id: postId,
    userId,
    target,
    imageUrl,
    caption,
    title: caption.substring(0, 50).trim() + '...',
    createdAt: Date.now(),
    categoria: 'Mentalidad',
    isAiAgent: true
  };

  feed.unshift(entry);
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), 'utf8');
  return postId;
}

async function generatePost() {
  console.log('🤖 Iniciando Generación de Post del Día con Gemini...');
  let success = true;

  let selectedTopicText = '';
  let selectedAngleType = '';
  let selectedAngleInstruction = '';
  
  // Obtener estilo rotativo de la librería de 50 prompts
  const selectedStyle = getRotatingPrompt();

  if (args.topic) {
    selectedTopicText = args.topic;
    selectedAngleType = "Manual";
    selectedAngleInstruction = "Genera el copy de forma directa y persuasiva sin un enfoque narrativo particular.";
    console.log(`🎯 Contenido por Parámetro: ${selectedTopicText}`);
  } else if (args['use-vault'] && fs.existsSync(VAULT_PATH)) {
    console.log('📂 Usando contenido de la Bóveda Local...');
    const vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    const category = args.category || 'ganchos_calientes';
    const items = vault[category] || vault['frases_motivacion'];
    selectedTopicText = items[Math.floor(Math.random() * items.length)];
    selectedAngleType = "Bóveda";
    selectedAngleInstruction = "Genera el copy basándote en este gancho de la bóveda.";
    console.log(`🎯 Contenido Seleccionado (${category}): ${selectedTopicText}`);
  } else {
    // Usar la Estrategia C Híbrida Rotativa
    const rotation = getRotatingTopicAndAngle();
    selectedTopicText = `${rotation.topic.tema}: ${rotation.topic.desc}`;
    selectedAngleType = rotation.angle.tipo;
    selectedAngleInstruction = rotation.angle.instruccion;
    console.log(`🎯 Tema Seleccionado: ${rotation.topic.tema}`);
    console.log(`🎭 Ángulo Narrativo Seleccionado: ${selectedAngleType}`);
  }

  console.log(`🎨 Estilo Visual Seleccionado: ${selectedStyle}`);

  let headless = true;
  if (fs.existsSync(CONFIG_PATH)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    headless = config.headless !== undefined ? config.headless : true;
  }
  if (args.headful) headless = false;
  if (args.headless) headless = true;

  const chatUrl = args.url || (fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).geminiDefaultChatUrl : null) || 'https://gemini.google.com/app?hl=es';

  console.log(`⚙️ Modo Navegador: ${headless ? 'Headless (Oculto)' : 'Visual (Visible)'}`);
  console.log(`🌐 URL de destino: ${chatUrl}`);

  // Identificador local para el bot
  let userId = 'local_ai_agent_gemini';
  console.log(`👤 Autor del Post: AI Agent Gemini (${userId})`);

  let browser;
  let context;
  let page;
  let isPlaywriter = false;

  // 3. Abrir navegador (Playwriter Híbrido)
  try {
    console.log('🔗 Conectando a Playwriter (Navegador Real del Usuario)...');
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    console.log('✅ ¡Conectado a Playwriter exitosamente!');
    context = browser.contexts()[0];
    
    // Buscar si ya hay una pestaña de gemini abierta o crear una nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('gemini.google.com'));
    if (!page) {
      page = await context.newPage();
    } else {
      console.log('🔄 Reutilizando pestaña existente de Gemini.');
    }
  } catch (e) {
    console.warn(`⚠️ Conexión a Playwriter falló (${e.message}). Iniciando browser local con sesión guardada...`);
    if (!fs.existsSync(STORAGE_STATE)) {
      console.error('❌ Error: No se encontró la sesión de Gemini de respaldo. Corre "node scripts/gemini-auth.mjs" primero.');
      process.exit(1);
    }
    browser = await localChromium.launch({ 
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    context = await browser.newContext({ 
      storageState: STORAGE_STATE,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    page = await context.newPage();
  }


  try {
    console.log(`🌐 Navegando a ${chatUrl}...`);
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(8000);

    // Cerrar popups obstructivos de Gemini (ej: "Potencia Gemini con Inteligencia personalizada")
    const geminiPopups = [
      'button:has-text("Ahora no")',
      'button:has-text("No, thanks")',
      'button:has-text("No, gracias")',
      'button:has-text("Omitir")',
      'button:has-text("Skip")'
    ];
    for (const sel of geminiPopups) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          console.log(`🧹 Popup obstructivo de Gemini cerrado con selector: ${sel}`);
          await page.waitForTimeout(1000);
        }
      } catch (e) {}
    }

    // Forzar "Nueva conversación" para evitar confusión de chats
    console.log('🔄 Iniciando un chat limpio (Nueva conversación) en Gemini...');
    const newChatSelectors = [
      '[aria-label="Nueva conversación"]',
      '[aria-label="New chat"]',
      'a[href="/app"]',
      'a[href*="gemini.google.com/app"]',
      'div[role="button"]:has-text("Nueva conversación")',
      'div[role="button"]:has-text("New chat")',
      'button:has-text("Nueva conversación")',
      'button:has-text("New chat")'
    ];
    let clickedNewChat = false;
    for (const sel of newChatSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          clickedNewChat = true;
          console.log(`✅ Clic en "${sel}" exitoso para iniciar chat limpio.`);
          await page.waitForTimeout(3000);
          break;
        }
      } catch (e) {}
    }
    if (!clickedNewChat) {
      console.log('⚠️ No se detectó botón de Nueva Conversación o ya está en un chat limpio. Continuando...');
    }

    // Leer la estrategia de marketing unificada
    let strategy = {
      tone: "Profesional pero fresco, tecnológico y callejero de trading (estilo argentino directo, sin humo)",
      cta_strategy: "Invitar a comentar una palabra clave para recibir un DM con invitación directa y acceso gratis a trade-share.com.",
      comment_keywords: ["SISTEMA", "IA", "INFO", "COMUNIDAD", "HERRAMIENTA"]
    };
    try {
      const stratPath = path.join(ROOT, '.agent', 'marketing_strategy.json');
      if (fs.existsSync(stratPath)) {
        strategy = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
      }
    } catch (e) {}

    // 1. PASO 1: GENERAR IMAGEN
    const imagePrompt = `Genera una fotografía sobria, realista y profesional de trading en formato 1:1.
Detalles visuales: ${selectedStyle}.
Tema conceptual: ${selectedTopicText}.
Requisitos visuales estrictos:
- Estilo: Fotografía analógica real de 35mm (estilo Leica M o Fujifilm), iluminación natural de día o luz cálida indirecta de escritorio, grano suave, profundidad de campo auténtica (bokeh sutil).
- Setup y entorno: Escritorio minimalista y limpio con laptop moderna mostrando gráficos reales de TradingView con velas japonesas sobrias (sin saturación extrema). Taza de café de cerámica o libreta de notas al lado.
- Si aparece una persona, debe lucir natural, relajada y concentrada, sin gestos exagerados ni poses teatrales de stock.
- PROHIBIDO: NO usar estilo cyberpunk, NO luces de neón cian/magenta/violeta, NO hologramas, NO elementos de ciencia ficción, NO velas flotando en el aire, NO puertas doradas ni ilustraciones fantásticas. La imagen debe verse como una foto real tomada por un fotógrafo profesional.
- Marca: Integra de forma muy sutil, pequeña y elegante el texto 'trade-share.com' en una esquina o grabado discretamente en la madera o libreta.`;

    console.log('🎨 PASO 1: Solicitando imagen a Gemini...');
    const selectors = ['div[contenteditable="true"]', 'textarea', 'div[role="textbox"]', '.textarea'];
    let inputLocated = false;
    
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { state: 'visible', timeout: 15000 });
        await page.locator(sel).first().fill(imagePrompt);
        inputLocated = true;
        break;
      } catch (e) {}
    }

    if (!inputLocated) {
      await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height - 100);
      await page.keyboard.type(imagePrompt);
    }

    await page.keyboard.press('Enter');
    console.log('⏳ Generando imagen (esperando hasta 3 minutos)...');
    logger.info('Gemini: Esperando generación de imagen...');
    const imgSrc = await awaitImageGeneration(page, 'img', 180000);
    logger.info(`Gemini: Imagen generada OK: ${imgSrc.substring(0, 80)}`);

    // 2. PASO 2: GENERAR TEXTO JSON
    const activeKeyword = strategy.comment_keywords[Math.floor(Math.random() * strategy.comment_keywords.length)];
    const textPrompt = `Excelente imagen. Ahora, basándote en ella y en el tema "${selectedTopicText}", genera el copy del post de forma magistral y muy persuasiva.
DEBES redactar el copy siguiendo la estrategia y el tono oficial de TradeShare:
- Tono: ${strategy.tone}
- Ángulo Narrativo Requerido (${selectedAngleType}): ${selectedAngleInstruction}
- CTAs: ${strategy.cta_strategy}
- Diferenciales a resaltar de forma elegante: TODO EL SISTEMA ES 100% GRATIS. Bitácora Pro conectada a MT5 gratis, creación de comunidades gratis, psicotrading y chat global sin costo. Vamos a competir contra las plataformas caras. Unificar todo en trade-share.com y dejar de saltar entre Discord, Zoom, Drive y planillas Excel.
- REQUISITO OBLIGATORIO: Incluir siempre la URL trade-share.com en el copy.

Responde ÚNICAMENTE con este JSON:
{
  "frase": "[Título muy corto y magnético en mayúsculas estilo argentino directo, tecnológico y sin humo]",
  "copy": "[Copy persuasivo y enganchador de 2 párrafos que fluya natural y al hueso, incorporando al final la llamada a la acción obligatoria invitando a comentar la palabra clave '${activeKeyword}' e incluyendo la URL trade-share.com]"
}`;

    console.log('📝 PASO 2: Solicitando copy a Gemini...');
    for (const sel of selectors) {
      if (await page.locator(sel).count() > 0) {
        await page.locator(sel).first().fill(textPrompt);
        break;
      }
    }
    await page.keyboard.press('Enter');
    console.log('⏳ Esperando JSON final...');
    await page.waitForTimeout(20000);

    // Extracción de JSON Ultra-Resiliente
    console.log('🎯 Extrayendo JSON...');
    const messages = await page.evaluate(() => {
      const elrs = document.querySelectorAll('message-content, .markdown, rich-text-container');
      return Array.from(elrs).map(el => el.innerText);
    });

    let jsonParsed = null;
    for (const text of messages.reverse()) {
      if (text.includes('DEBES responder ÚNICAMENTE')) continue;
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          const raw = text.substring(start, end + 1).replace(/```json|```/g, '').trim();
          jsonParsed = JSON.parse(raw);
          if (jsonParsed.frase && jsonParsed.copy) break;
        } catch (e) {}
      }
    }

    if (!jsonParsed) throw new Error('No se encontró JSON válido.');

    // Descargar imagen usando la utilidad unificada
    console.log('📥 Descargando imagen generada...');
    const fileName = `trading_post_gemini_${Date.now()}.png`;
    const localPath = path.join(ROOT, 'public', 'images', 'feed', fileName);
    await downloadAndSaveImage(page, imgSrc, localPath);
    logger.info(`Gemini: Imagen guardada en vault: ${localPath}`);

    const todayStr = new Date().toISOString().split('T')[0];
    const vaultEntry = {
      id: `vault_${Date.now()}`,
      date: todayStr,
      timestamp: Date.now(),
      frase: jsonParsed.frase,
      copy: jsonParsed.copy,
      imagenUrl: `/images/feed/${fileName}`,
      communitySlug: args.community ? 'forex-traders-hub' : null,
      communityPostUrl: null,
      instagramFeedUrl: null,
      instagramStoryPosted: false
    };

    // 6. Publicar LOCALMENTE - Saltar si publish=false
    if (args.publish !== 'false' && args.publish !== false) {
      console.log('🔍 Publicando Localmente...');
      const target = args.community ? 'community' : 'feed';
      const postId = addToLocalPortalFeed(target, `/images/feed/${fileName}`, jsonParsed.copy, userId);
      const communityPostUrl = `http://localhost:5680/local-portal/posts/${postId}`;
      vaultEntry.communityPostUrl = communityPostUrl;
      console.log(`🎉 Publicado en Portal Local (${target}): ${communityPostUrl}`);
    } else {
      console.log('⏭️ Saltando publicación local en portal (se guarda directamente en bóveda programada)');
    }

    // 7. Registrar en la Bóveda de Contenidos (.agent/marketing_vault.json)
    const vaultPath = path.join(ROOT, '.agent', 'marketing_vault.json');
    let vault = [];
    if (fs.existsSync(vaultPath)) {
      try {
        vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      } catch (e) {
        vault = [];
      }
    }

    vault.unshift(vaultEntry);
    fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
    console.log('💾 ¡Post registrado con éxito en la Bóveda de Contenidos!');

  } catch (error) {
    success = false;
    console.error('❌ Error:', error.message);
    try {
      await page.screenshot({ path: path.join(ROOT, 'public', 'generated_posts', 'debug_gemini.png') });
    } catch (e) {}
  } finally {
    if (context && !isPlaywriter) {
      await context.storageState({ path: STORAGE_STATE }).catch(() => {});
    }
    if (browser) {
      if (isPlaywriter) {
        console.log('🔌 Desconectando de Playwriter (dejando el navegador real abierto)...');
        if (typeof browser.disconnect === 'function') {
          await browser.disconnect().catch(() => {});
        } else if (typeof browser.close === 'function') {
          await browser.close().catch(() => {});
        }
      } else {
        await browser.close().catch(() => {});
      }
    }
    process.exit(success ? 0 : 1);
  }
}

generatePost();
