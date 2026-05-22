import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { getRotatingPrompt } from './prompt-library.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'gemini_auth.json');
const CONFIG_PATH = path.join(process.cwd(), '.agent', 'ig-config.json');
const VAULT_PATH = path.join(process.cwd(), '.agent', 'marketing_vault', 'vault_es.json');

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
  const feedPath = path.join(process.cwd(), '.agent', 'local_portal_feed.json');
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
  
  // Obtener estilo rotativo de la librería de 50 prompts
  const selectedStyle = getRotatingPrompt();

  if (args.topic) {
    selectedTopicText = args.topic;
    console.log(`🎯 Contenido por Parámetro: ${selectedTopicText}`);
  } else if (args['use-vault'] && fs.existsSync(VAULT_PATH)) {
    console.log('📂 Usando contenido de la Bóveda Local...');
    const vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    const category = args.category || 'ganchos_calientes';
    const items = vault[category] || vault['frases_motivacion'];
    selectedTopicText = items[Math.floor(Math.random() * items.length)];
    console.log(`🎯 Contenido Seleccionado (${category}): ${selectedTopicText}`);
  } else {
    selectedTopicText = "Disciplina y Enfoque en el Trading";
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

  if (!fs.existsSync(STORAGE_STATE)) {
    console.error('❌ Error: No se encontró la sesión de Gemini. Corre "node scripts/gemini-auth.mjs" primero.');
    process.exit(1);
  }

  // Identificador local para el bot
  let userId = 'local_ai_agent_gemini';
  console.log(`👤 Autor del Post: AI Agent Gemini (${userId})`);

  const browser = await chromium.launch({ 
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();

  try {
    console.log(`🌐 Navegando a ${chatUrl}...`);
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(8000);

    // Leer la estrategia de marketing unificada
    let strategy = {
      tone: "Profesional pero fresco, tecnológico y callejero de trading (estilo argentino directo, sin humo)",
      cta_strategy: "Invitar a comentar una palabra clave para recibir un DM con invitación directa y acceso gratis a trade-share.com.",
      comment_keywords: ["SISTEMA", "IA", "INFO", "COMUNIDAD", "HERRAMIENTA"]
    };
    try {
      const stratPath = path.join(process.cwd(), '.agent', 'marketing_strategy.json');
      if (fs.existsSync(stratPath)) {
        strategy = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
      }
    } catch (e) {}

    // 1. PASO 1: GENERAR IMAGEN
    const imagePrompt = `Genera una imagen artística de trading en formato 1:1. 
Tema: ${selectedTopicText}. 
Estilo Visual: ${selectedStyle}. 
Incluye el texto sutil 'www.trade-share.com'. 
La imagen debe ser impactante, profesional y única.
Lineamientos estratégicos de marca: Estilo de alta fidelidad tecnológica, futurismo cyberpunk con luces de neón cian y magenta. Evitar humo y promesas falsas.`;

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
    await page.waitForTimeout(180000);

    // 2. PASO 2: GENERAR TEXTO JSON
    const activeKeyword = strategy.comment_keywords[Math.floor(Math.random() * strategy.comment_keywords.length)];
    const textPrompt = `Excelente imagen. Ahora, basándote en ella y en el tema "${selectedTopicText}", genera el copy del post de forma magistral y muy persuasiva.
DEBES redactar el copy siguiendo la estrategia y el tono oficial de TradeShare:
- Tono: ${strategy.tone}
- CTAs: ${strategy.cta_strategy}
- Diferenciales a resaltar de forma elegante: Para traders gratis (TradingView integrado, bitácora automatizada, psicotrading, chat global, análisis MT5 con IA). Para líderes pagos (comunidad branding, TV en vivo, subcomunidades 1 a 1, cursos con IA tracker). Unificar todo en un solo ecosistema y dejar de saltar entre Discord, Zoom, Drive y planillas Excel.

Responde ÚNICAMENTE con este JSON:
{
  "frase": "[Título muy corto y magnético en mayúsculas estilo argentino directo, tecnológico y sin humo]",
  "copy": "[Copy persuasivo y enganchador de 2 párrafos que fluya natural y al hueso, incorporando al final la llamada a la acción obligatoria invitando a comentar la palabra clave '${activeKeyword}']"
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
    await page.waitForTimeout(15000);

    await page.waitForTimeout(5000);

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

    // Localizar Imagen
    console.log('📥 Localizando imagen...');
    let imgSrc = null;
    const imgs = page.locator('img');
    const imgCount = await imgs.count();
    for (let i = imgCount - 1; i >= 0; i--) {
      const img = imgs.nth(i);
      const src = await img.getAttribute('src');
      if (src && (src.includes('googleusercontent.com') || src.includes('google'))) {
        const box = await img.boundingBox();
        if (box && box.width > 300) {
          imgSrc = src;
          break;
        }
      }
    }

    if (!imgSrc) throw new Error('No se encontró imagen.');

    let buffer;
    if (imgSrc.startsWith('blob:')) {
      console.log('💧 Detectada URL Blob, extrayendo datos vía buffer...');
      buffer = await page.evaluate(async (url) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, imgSrc);
      buffer = Buffer.from(buffer);
    } else {
      const response = await page.request.get(imgSrc);
      buffer = await response.body();
    }

    const fileName = `trading_post_gemini_${Date.now()}.png`;
    const localPath = path.join(process.cwd(), 'public', 'generated_posts', fileName);
    
    if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
    console.log(`💾 Guardada: ${localPath}`);

    if (args.publish === 'false' || args.publish === false) return;

    // Publicar LOCALMENTE
    console.log('🔍 Publicando Localmente...');
    const target = args.community ? 'community' : 'feed';
    const postId = addToLocalPortalFeed(target, `/generated_posts/${fileName}`, jsonParsed.copy, userId);
    
    console.log(`🎉 Publicado en Portal Local (${target}): http://localhost:5680/local-portal/posts/${postId}`);

  } catch (error) {
    success = false;
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'public/generated_posts/debug_gemini.png' });
  } finally {
    await context.storageState({ path: STORAGE_STATE });
    await browser.close();
    process.exit(success ? 0 : 1);
  }
}

generatePost();
