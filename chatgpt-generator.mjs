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
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORAGE_STATE = path.join(ROOT, '.agent', 'chatgpt_auth.json');
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

async function generatePost() {
  console.log('🤖 Iniciando Generación de Post del Día con ChatGPT...');
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

  const chatUrl = args.url || (fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).chatgptDefaultChatUrl : null) || 'https://chatgpt.com';

  console.log(`⚙️ Modo Navegador: ${headless ? 'Headless (Oculto)' : 'Visual (Visible)'}`);
  console.log(`🌐 URL de destino: ${chatUrl}`);

  // Identificador local para el bot
  let userId = 'local_ai_agent_chatgpt';
  console.log(`👤 Autor del Post: AI Agent ChatGPT (${userId})`);

  let browser;
  let context;
  let page;
  let isPlaywriter = false;

  // 3. Abrir navegador (Playwriter Híbrido con evasión anti-detección)
  try {
    console.log('🔗 Conectando a Playwriter (Navegador Real del Usuario)...');
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    console.log('✅ ¡Conectado a Playwriter exitosamente!');
    context = browser.contexts()[0];
    
    // Buscar si ya hay una pestaña de chatgpt abierta o crear una nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('chatgpt.com'));
    if (!page) {
      page = await context.newPage();
    } else {
      console.log('🔄 Reutilizando pestaña existente de ChatGPT.');
    }
  } catch (e) {
    console.warn(`⚠️ Conexión a Playwriter falló (${e.message}). Iniciando browser local con sesión guardada...`);
    
    if (!fs.existsSync(STORAGE_STATE)) {
      console.error('❌ Error: No se encontró la sesión de ChatGPT de respaldo. Corre "node scripts/chatgpt-auth.mjs" primero.');
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

  // Ocultar navigator.webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log(`🌐 Navegando a ${chatUrl}...`);
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000); // Dar más tiempo para cargar en hilos largos

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
    const imagePrompt = `Genera una imagen premium de trading en formato 1:1. 
Estilo: ${selectedStyle}. 
Tema central: ${selectedTopicText}. 
Requisito OBLIGATORIO: Integra de forma sutil y elegante el texto 'www.trade-share.com' en el diseño. 
Asegúrate de que la composición sea única, impactante y no repetitiva.
Lineamientos estratégicos de marca: Estilo de alta fidelidad tecnológica, futurismo cyberpunk con luces de neón cian y magenta. Evitar humo y promesas falsas.`;

    console.log('🎨 PASO 1: Solicitando generación de imagen...');
    const textarea = page.locator('#prompt-textarea');
    await textarea.fill(imagePrompt);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    console.log('⏳ Esperando a que finalice la generación de la imagen...');
    logger.info('ChatGPT: Esperando generación de imagen...');
    await page.waitForSelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]', { state: 'attached', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]', { state: 'hidden', timeout: 180000 });
    await page.waitForTimeout(3000);
    
    // Confirmar que la imagen está completamente cargada en el DOM
    const generatedImgSrc = await awaitImageGeneration(page, 'img', 30000);
    logger.info(`ChatGPT: Imagen generada OK: ${generatedImgSrc.substring(0, 80)}`);

    // 2. PASO 2: GENERAR TEXTO JSON
    const activeKeyword = strategy.comment_keywords[Math.floor(Math.random() * strategy.comment_keywords.length)];
    const textPrompt = `Excelente imagen. Ahora, basándote en ella y en el tema "${selectedTopicText}", genera el copy del post de forma magistral y muy persuasiva.
DEBES redactar el copy siguiendo la estrategia y el tono oficial de TradeShare:
- Tono: ${strategy.tone}
- Ángulo Narrativo Requerido (${selectedAngleType}): ${selectedAngleInstruction}
- CTAs: ${strategy.cta_strategy}
- Diferenciales a resaltar de forma elegante: Para traders gratis (TradingView integrado, bitácora automatizada, psicotrading, chat global, análisis MT5 con IA). Para líderes pagos (comunidad branding, TV en vivo, subcomunidades 1 a 1, cursos con IA tracker). Unificar todo en un solo ecosistema y dejar de saltar entre Discord, Zoom, Drive y planillas Excel.

Responde ÚNICAMENTE en este formato JSON puro:
{
  "frase": "[Título muy corto y magnético en mayúsculas estilo argentino directo, tecnológico y sin humo]",
  "copy": "[Copy persuasivo y enganchador de 2 párrafos que fluya natural y al hueso, incorporando al final la llamada a la acción obligatoria invitando a comentar la palabra clave '${activeKeyword}']"
}`;

    console.log('📝 PASO 2: Solicitando copy interactivo...');
    await textarea.fill(textPrompt);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    console.log('⏳ Esperando el JSON final...');
    await page.waitForSelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]', { state: 'attached', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]', { state: 'hidden', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Esperar un par de segundos adicionales para el renderizado final de la imagen
    await page.waitForTimeout(4000);

    // 4. Extracción de JSON globalmente en la página (Súper robusto frente a cambios de DOM)
    console.log('🎯 Extrayendo el texto del post en la página...');
    let jsonParsed = null;
    const textLocators = page.locator('div.markdown, div[class*="markdown"], p');
    const textCount = await textLocators.count();

    for (let i = textCount - 1; i >= 0; i--) {
      try {
        const text = await textLocators.nth(i).innerText();
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          jsonParsed = JSON.parse(jsonMatch[0]);
          console.log('🎯 JSON extraído con éxito:', jsonParsed);
          break;
        }
      } catch (e) {}
    }

    if (!jsonParsed) {
      console.warn('⚠️ No se pudo parsear un JSON estructurado de forma automática. Creando fallback...');
      jsonParsed = {
        frase: `Disciplina y Enfoque: ${selectedTopicText.split(':')[0]}`,
        copy: `La constancia diaria en este tema es el verdadero pilar de los traders de alta rentabilidad. Mantén tus ojos en las metas y ejecuta tu plan sin dudar.`
      };
    }

    // 5. Descargar la Imagen Generada buscando en el último mensaje de la IA (Bulletproof)
    console.log('📥 Localizando la imagen generada por DALL-E en el último mensaje...');
    let imgSrc = null;
    const lastAssistantMessage = page.locator('div[data-message-author-role="assistant"]').last();
    const imgLocator = lastAssistantMessage.locator('img');
    const imgCount = await imgLocator.count();

    for (let i = imgCount - 1; i >= 0; i--) {
      try {
        const img = imgLocator.nth(i);
        const src = await img.getAttribute('src');
        const alt = await img.getAttribute('alt') || '';
        
        // Filtros específicos para DALL-E en ChatGPT
        if (src && (src.includes('oaiusercontent.com') || alt.toLowerCase().includes('generated') || alt.toLowerCase().includes('dall-e'))) {
          // Verificar que no sea un avatar pequeño (los avatares suelen ser 32x32 o similares)
          const box = await img.boundingBox();
          if (box && box.width > 200) {
            imgSrc = src;
            console.log(`✅ Imagen DALL-E localizada: ${imgSrc} (${Math.round(box.width)}x${Math.round(box.height)})`);
            break;
          }
        }
      } catch (e) {}
    }

    // Fallback general: buscar la imagen más grande que no sea un avatar
    if (!imgSrc && imgCount > 0) {
      console.log('⚠️ Buscando imagen por tamaño (fallback)...');
      let largestArea = 0;
      for (let i = imgCount - 1; i >= 0; i--) {
        try {
          const img = imgLocator.nth(i);
          const src = await img.getAttribute('src');
          if (src && src.startsWith('http') && !src.includes('auth0') && !src.includes('avatar')) {
            const box = await img.boundingBox();
            if (box && box.width > 300) {
              const area = box.width * box.height;
              if (area > largestArea) {
                largestArea = area;
                imgSrc = src;
              }
            }
          }
        } catch (e) {}
      }
      if (imgSrc) console.log(`✅ Imagen localizada por tamaño: ${imgSrc}`);
    }

    if (!imgSrc) {
      throw new Error('No se pudo localizar ninguna imagen generada válida en la página de ChatGPT.');
    }

    console.log('📥 Descargando imagen generada...');
    const timestamp = Date.now();
    const fileName = `trading_post_${timestamp}.png`;
    const localPath = path.join(ROOT, 'public', 'images', 'feed', fileName);
    await downloadAndSaveImage(page, imgSrc, localPath);
    logger.info(`ChatGPT: Imagen guardada en vault: ${localPath}`);

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
      instagramFeedUrl: null, // Se rellenará tras publicar en Instagram
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

    // 8. Retornar los datos para la interfaz o puente
    console.log(`SUCCESS: Post creado: "${jsonParsed.frase}" en ${communityPostUrl}`);

  } catch (error) {
    success = false;
    console.error('❌ Error durante la generación:', error.message);
    try {
      await page.screenshot({ path: path.join(ROOT, 'public', 'generated_posts', 'debug_chatgpt.png') });
      console.log('📸 Captura de pantalla de depuración guardada en public/generated_posts/debug_chatgpt.png');
    } catch (e) {
      console.error('⚠️ No se pudo tomar la captura de pantalla de depuración:', e.message);
    }
  } finally {
    if (browser) {
      if (isPlaywriter) {
        console.log('🔌 Desconectando de Playwriter (dejando el navegador real abierto)...');
        await browser.close().catch(() => {});
      } else {
        await browser.close().catch(() => {});
      }
    }
    process.exit(success ? 0 : 1);
  }
}

generatePost();
