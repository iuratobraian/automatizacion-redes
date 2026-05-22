import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { ConvexClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { getRotatingPrompt } from './prompt-library.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'meta_auth.json');
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

async function generateMetaAI() {
  console.log('🤖 Iniciando Generación de Post con Meta AI (Desktop Mode)...');
  
  if (!fs.existsSync(STORAGE_STATE)) {
    console.error('❌ Error: No se encontró la sesión de Meta AI. Corre "node scripts/meta-auth.mjs" primero.');
    process.exit(1);
  }

  let selectedTopicText = '';
  if (args.topic) {
    selectedTopicText = args.topic;
  } else if (args['use-vault'] && fs.existsSync(VAULT_PATH)) {
    const vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    const category = args.category || 'ganchos_calientes';
    const items = vault[category] || vault['frases_motivacion'];
    selectedTopicText = items[Math.floor(Math.random() * items.length)];
  } else {
    selectedTopicText = "Disciplina y Éxito en el Trading";
  }

  const localCopy = {
    frase: selectedTopicText,
    copy: `El éxito en el trading se construye con paciencia. En TradeShare te damos las herramientas para dominar los mercados. www.trade-share.com`
  };

  const convexUrl = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || 'https://diligent-wildcat-523.convex.cloud';
  const client = new ConvexClient(convexUrl);
  let userId = 'braiurato_admin';
  try {
    const profile = await client.query(api.profiles.getProfileByUsuario, { usuario: 'braiurato' });
    if (profile?.userId) userId = profile.userId;
  } catch (err) {}

  let headless = args.headless !== false;
  if (args.headful) headless = false;

  const chatUrl = args.url || (fs.existsSync(path.join(process.cwd(), '.agent', 'ig-config.json')) ? JSON.parse(fs.readFileSync(path.join(process.cwd(), '.agent', 'ig-config.json'), 'utf8')).metaDefaultChatUrl : null) || 'https://www.meta.ai/';

  console.log(`⚙️ Modo Navegador: ${headless ? 'Headless (Oculto)' : 'Visual (Visible)'}`);
  console.log(`🌐 URL de destino: ${chatUrl}`);

  const browser = await chromium.launch({ 
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    storageState: STORAGE_STATE
  });
  const page = await context.newPage();

  try {
    console.log(`🌐 Navegando a ${chatUrl}...`);
    await page.goto(chatUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Cerrar diálogos obstructivos
    try {
      const closeBtn = page.locator('div[role="dialog"] button, svg[aria-label="Close"], button:has-text("Connect")').first();
      if (await closeBtn.isVisible({ timeout: 5000 })) {
        await closeBtn.click({ force: true });
        console.log('🧹 Diálogo cerrado.');
        await page.waitForTimeout(1000);
      }
    } catch (e) {}

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

    const selectedStyle = getRotatingPrompt();
    const imagePrompt = `imagine ${selectedTopicText}. Estilo: ${selectedStyle}. Vertical 9:16 aspect ratio. Cyberpunk trading style, neon lights cian and magenta, 8k. Include text 'www.trade-share.com' in the corner. Make it unique and high contrast. Lineamientos estratégicos de marca: Estilo de alta fidelidad tecnológica, futurismo cyberpunk con luces de neón cian y magenta. Evitar humo y promesas falsas.`;
    
    console.log('🎨 PASO 1: Solicitando generación de imagen a Meta AI...');
    const inputSelector = 'textarea, #prompt-textarea, [data-testid="composer-input"]';
    try {
      const textarea = page.locator(inputSelector).first();
      await textarea.waitFor({ state: 'attached', timeout: 10000 });
      await textarea.fill(imagePrompt);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      console.log('✅ Prompt de imagen enviado.');
    } catch (e) {
      await page.mouse.click(960, 500); 
      await page.keyboard.type(imagePrompt, { delay: 30 });
      await page.keyboard.press('Enter');
    }

    console.log('⏳ Generando imagen (60s)...');
    await page.waitForTimeout(60000); 

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

    console.log('📝 PASO 2: Solicitando copy interactivo a Meta AI...');
    try {
      const textarea = page.locator(inputSelector).first();
      await textarea.fill(textPrompt);
      await page.keyboard.press('Enter');
    } catch (e) {
      await page.keyboard.type(textPrompt, { delay: 30 });
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(10000);

    console.log('📥 Buscando imagen generada...');
    const imgSrc = await page.evaluate(() => {
      // Buscar la imagen más grande que no sea un icono
      const imgs = Array.from(document.querySelectorAll('img'));
      const candidates = imgs.filter(img => img.naturalWidth > 500 && !img.src.includes('avatar') && !img.src.includes('logo'));
      return candidates.length > 0 ? candidates[candidates.length - 1].src : null;
    });

    let finalImgPath = '';
    const timestamp = Date.now();

    if (imgSrc) {
      console.log(`✅ Imagen localizada: ${imgSrc}`);
      const response = await page.request.get(imgSrc);
      const buffer = await response.body();
      const fileName = `trading_post_meta_${timestamp}.png`;
      finalImgPath = path.join(process.cwd(), 'public', 'generated_posts', fileName);
      if (!fs.existsSync(path.dirname(finalImgPath))) fs.mkdirSync(path.dirname(finalImgPath), { recursive: true });
      fs.writeFileSync(finalImgPath, buffer);
    } else {
      console.warn('⚠️ No se detectó URL de imagen, tomando captura del área de resultado...');
      const fileName = `trading_post_meta_snap_${timestamp}.png`;
      finalImgPath = path.join(process.cwd(), 'public', 'generated_posts', fileName);
      await page.screenshot({ path: finalImgPath });
    }

    console.log(`💾 Imagen guardada: ${finalImgPath}`);

    if (args.publish === 'false' || args.publish === false) return;

    console.log('🔍 Publicando en TradeShare...');
    const community = await client.query(api.communities.getCommunity, { slug: 'forex-traders-hub' });
    if (community) {
      const postId = await client.mutation(api.communities.createPost, {
        communityId: community._id, contenido: localCopy.copy, titulo: localCopy.frase,
        imagenUrl: `/generated_posts/${path.basename(finalImgPath)}`, userId, tipo: 'text', categoria: 'Mentalidad'
      });
      console.log(`🎉 Publicado en Comunidad: http://localhost:3000/comunidad/forex-traders-hub/post/${postId}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'public/generated_posts/debug_meta.png' });
  } finally {
    await browser.close();
    process.exit(0);
  }
}

generateMetaAI();
