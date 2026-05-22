import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { ConvexClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
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

    // 1. PASO 1: IMAGEN
    const topicText = args.topic || 'Trading de criptomonedas y forex';
    const selectedStyle = getRotatingPrompt();
    const imagePrompt = `Crea una imagen de trading ultra-profesional en formato 1:1. 
Estilo: ${selectedStyle}. 
Tema: ${topicText}. 
Incluye 'www.trade-share.com' de forma elegante.
Lineamientos estratégicos de marca: Estilo de alta fidelidad tecnológica, futurismo cyberpunk con luces de neón cian y magenta. Evitar humo y promesas falsas.`;

    console.log('🎨 PASO 1: Solicitando imagen a Manus...');
    await page.locator(inputSelector).first().fill(imagePrompt);
    await page.keyboard.press('Enter');
    
    // Esperar a que Manus dibuje y termine la imagen
    await waitForResponseComplete(page, 180000); // hasta 3 minutos para imágenes complejas

    // 2. PASO 2: TEXTO
    const activeKeyword = strategy.comment_keywords[Math.floor(Math.random() * strategy.comment_keywords.length)];
    const textPrompt = `Excelente imagen. Ahora, basándote en ella, genera el copy del post de forma magistral y muy persuasiva en español.
DEBES redactar el copy siguiendo la estrategia y el tono oficial de TradeShare:
- Tono: ${strategy.tone}
- CTAs: ${strategy.cta_strategy}
- Diferenciales a resaltar de forma elegante: Para traders gratis (TradingView integrado, bitácora automatizada, psicotrading, chat global, análisis MT5 con IA). Para líderes pagos (comunidad branding, TV en vivo, subcomunidades 1 a 1, cursos con IA tracker). Unificar todo en un solo ecosistema y dejar de saltar entre Discord, Zoom, Drive y planillas Excel.

Responde ÚNICAMENTE en este formato JSON puro:
{
  "frase": "[Título muy corto y magnético en mayúsculas estilo argentino directo, tecnológico y sin humo]",
  "copy": "[Copy persuasivo y enganchador de 2 párrafos que fluya natural y al hueso, incorporando al final la llamada a la acción obligatoria invitando a comentar la palabra clave '${activeKeyword}']"
}`;

    console.log('📝 PASO 2: Solicitando copy a Manus...');
    await page.locator(inputSelector).first().fill(textPrompt);
    await page.keyboard.press('Enter');
    
    // Esperar a que escriba el JSON de copy
    await waitForResponseComplete(page, 90000);

    // Extracción de JSON
    console.log('🎯 Buscando JSON en Manus...');
    const bodyText = await page.innerText('body');
    const jsonMatch = bodyText.match(/\{[\s\S]*?\}/);
    let jsonParsed = { frase: 'Éxito en el Trading', copy: 'Únete a la revolución de TradeShare.' };
    if (jsonMatch) {
      try { jsonParsed = JSON.parse(jsonMatch[0]); } catch (e) {}
    }

    // Scroll para revelar la imagen y el texto completo en la parte inferior del chat
    console.log('↕️ Ajustando scroll del chat para la captura...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(3000);

    // Captura de pantalla como imagen final
    const timestamp = Date.now();
    const fileName = `trading_post_manus_${timestamp}.png`;
    const localPath = path.join(process.cwd(), 'public', 'generated_posts', fileName);
    
    await page.screenshot({ path: localPath });
    console.log(`💾 Guardada captura de Manus: ${localPath}`);

    // Publicar en Convex (opcional)
    // ... lógica similar a chatgpt-generator ...

  } catch (error) {
    success = false;
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
    process.exit(success ? 0 : 1);
  }
}

generateManus();
