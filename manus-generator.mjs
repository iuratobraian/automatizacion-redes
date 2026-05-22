import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { getRotatingPrompt } from './prompt-library.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'manus_auth.json');
const CONFIG_PATH = path.join(process.cwd(), '.agent', 'ig-config.json');

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

async function waitForResponseComplete(page, timeoutMs = 120000) {
  console.log('⏳ Esperando a que Manus termine de responder...');
  const checkInterval = 3000;
  let elapsed = 0;
  let lastHtml = '';
  let stableTicks = 0;

  while (elapsed < timeoutMs) {
    await page.waitForTimeout(checkInterval);
    elapsed += checkInterval;

    const currentHtml = await page.innerText('body');
    
    // Si el texto se mantiene idéntico por 3 revisiones (9 segundos) y no está vacío
    if (currentHtml === lastHtml && currentHtml.length > 200) {
      stableTicks++;
      if (stableTicks >= 3) {
        console.log(`✅ Generación completada y estabilizada tras ${elapsed / 1000} segundos.`);
        return true;
      }
    } else {
      stableTicks = 0;
      lastHtml = currentHtml;
    }
  }
  console.log(`⚠️ Se alcanzó el timeout de ${timeoutMs / 1000}s sin confirmar estabilidad total. Continuando...`);
  return false;
}

async function generateManus() {
  console.log('🤖 Iniciando Generación con Manus.im...');
  let success = true;

  let headless = true;
  if (fs.existsSync(CONFIG_PATH)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    headless = config.headless !== undefined ? config.headless : true;
  }
  if (args.headful) headless = false;
  if (args.headless) headless = true;

  const chatUrl = args.url || (fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).manusDefaultChatUrl : null) || 'https://manus.im/';

  console.log(`⚙️ Modo Navegador: ${headless ? 'Headless (Oculto)' : 'Visual (Visible)'}`);
  console.log(`🌐 URL de destino: ${chatUrl}`);

  if (!fs.existsSync(STORAGE_STATE)) {
    console.error('❌ Error: No se encontró la sesión de Manus.im. Corre "node scripts/manus-auth.mjs" primero.');
    process.exit(1);
  }

  // Identificador local para el bot
  let userId = 'local_ai_agent_manus';
  console.log(`👤 Autor del Post: AI Agent Manus (${userId})`);

  const browser = await chromium.launch({ 
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();

  try {
    await page.goto(chatUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const inputSelector = 'textarea, [contenteditable="true"], [role="textbox"]';

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

    const selectedTopicText = args.topic || "Paciencia y Consistencia en Trading";
    const selectedStyle = getRotatingPrompt();
    const activeKeyword = strategy.comment_keywords[Math.floor(Math.random() * strategy.comment_keywords.length)];

    const prompt = `Genera un post magistral para TradeShare.
1. Genera una IMAGEN 1:1 estilo ${selectedStyle} sobre el tema "${selectedTopicText}". Incluye el texto 'www.trade-share.com'.
2. Genera un copy persuasivo:
   - Tono: ${strategy.tone}
   - CTA: Invitar a comentar '${activeKeyword}'.
   
DEBES RESPONDER AL FINAL CON UN JSON PURO:
{
  "frase": "[Título corto]",
  "copy": "[Copy persuasivo]",
  "imageUrl": "[Url de la imagen que generaste]"
}`;

    await page.locator(inputSelector).first().fill(prompt);
    await page.keyboard.press('Enter');

    await waitForResponseComplete(page);

    // Extraer JSON y Guardar Imagen (Similar a otros generadores)
    console.log('🎯 Extrayendo resultados de Manus...');
    const content = await page.innerText('body');
    
    let jsonParsed = null;
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        const raw = content.substring(start, end + 1).replace(/```json|```/g, '').trim();
        jsonParsed = JSON.parse(raw);
      } catch (e) {}
    }

    if (!jsonParsed) {
      jsonParsed = {
        frase: selectedTopicText.toUpperCase(),
        copy: `Trading con consistencia. Comenta ${activeKeyword} para unirte.`
      };
    }

    // Localizar Imagen
    let imgSrc = null;
    const imgs = page.locator('img');
    const count = await imgs.count();
    for (let i = count - 1; i >= 0; i--) {
      const src = await imgs.nth(i).getAttribute('src');
      if (src && (src.includes('blob:') || src.includes('manus') || src.includes('google'))) {
        imgSrc = src;
        break;
      }
    }

    if (imgSrc) {
      const response = await page.request.get(imgSrc);
      const buffer = await response.body();
      const fileName = `trading_post_manus_${Date.now()}.png`;
      const localPath = path.join(process.cwd(), 'public', 'generated_posts', fileName);
      if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buffer);
      console.log(`💾 Imagen guardada: ${localPath}`);

      if (args.publish !== 'false') {
        const target = args.community ? 'community' : 'feed';
        addToLocalPortalFeed(target, `/generated_posts/${fileName}`, jsonParsed.copy, userId);
        console.log('🎉 Publicado Localmente en el Portal.');
      }
    }

  } catch (err) {
    success = false;
    console.error('❌ Error en Manus:', err.message);
  } finally {
    await browser.close();
    process.exit(success ? 0 : 1);
  }
}

generateManus();
