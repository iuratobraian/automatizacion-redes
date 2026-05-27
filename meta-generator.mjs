import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getRotatingPrompt, getRotatingTopicAndAngle } from './prompt-library.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORAGE_STATE = path.join(ROOT, '.agent', 'meta_auth.json');
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

  // Identificador local para el bot
  let userId = 'local_ai_agent_meta';
  console.log(`👤 Autor del Post: AI Agent Meta (${userId})`);

  let headless = args.headless !== false;
  if (args.headful) headless = false;

  const chatUrl = args.url || (fs.existsSync(path.join(ROOT, '.agent', 'ig-config.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, '.agent', 'ig-config.json'), 'utf8')).metaDefaultChatUrl : null) || 'https://www.meta.ai/';

  console.log(`⚙️ Modo Navegador: ${headless ? 'Headless (Oculto)' : 'Visual (Visible)'}`);
  console.log(`🌐 URL de destino: ${chatUrl}`);

  let browser;
  let context;
  let page;
  let isPlaywriter = false;

  // Abrir navegador (Playwriter Híbrido con evasión anti-detección)
  try {
    console.log('🔗 Conectando a Playwriter (Navegador Real del Usuario)...');
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    console.log('✅ ¡Conectado a Playwriter exitosamente!');
    context = browser.contexts()[0];
    
    // Buscar si ya hay una pestaña de meta abierta o crear una nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('meta.ai'));
    if (!page) {
      page = await context.newPage();
    } else {
      console.log('🔄 Reutilizando pestaña existente de Meta AI.');
    }
  } catch (e) {
    console.error(`❌ ERROR CRÍTICO: La conexión a Playwriter falló (${e.message}).`);
    console.error('👉 ES OBLIGATORIO utilizar tu navegador personal mediante Playwriter para esta operación.');
    console.error('👉 Por favor, asegúrate de que el daemon de Playwriter y PM2 estén activos y corriendo en el puerto 19988.');
    process.exit(1);
  }

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
      const stratPath = path.join(ROOT, '.agent', 'marketing_strategy.json');
      if (fs.existsSync(stratPath)) {
        strategy = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
      }
    } catch (e) {}

    const selectedStyle = getRotatingPrompt();
    const imagePrompt = `imagine ${selectedTopicText}. Estilo: ${selectedStyle}. Vertical 9:16 aspect ratio. Cyberpunk trading style, neon lights cian and magenta, 8k. Include text 'www.trade-share.com' in the corner. Make it unique and high contrast. Lineamientos estratégicos de marca: Estilo de alta fidelidad tecnológica, futurismo cyberpunk con luces de neón cian y magenta. Evitar humo y promesas falsas.`;
    
    async function sendPrompt(promptText) {
      console.log(`💬 Preparando para enviar prompt (${promptText.substring(0, 40)}...)...`);
      const inputSelectors = [
        'textarea',
        '#prompt-textarea',
        '[data-testid="composer-input"]',
        'div[contenteditable="true"]',
        'div[role="textbox"]'
      ];
      
      let inputEl = null;
      for (const sel of inputSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            inputEl = el;
            break;
          }
        } catch(e) {}
      }
      
      if (inputEl) {
        await inputEl.click({ force: true }).catch(() => {});
        await inputEl.focus();
        await page.waitForTimeout(300);
        // Intentar limpiar por si hay texto residual
        try {
          await inputEl.fill('');
        } catch (e) {}
        await inputEl.fill(promptText);
        await page.waitForTimeout(1000);
      } else {
        console.log('⚠️ Editor no encontrado por selectores. Intentando clic en coordenadas...');
        await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height - 80);
        await page.waitForTimeout(500);
        await page.keyboard.insertText(promptText);
        await page.waitForTimeout(1000);
      }
      
      // Intentar presionar el botón físico de Enviar primero
      const sendBtnSelectors = [
        'button[aria-label*="Send"]',
        'button[aria-label*="Enviar"]',
        'div[role="button"][aria-label*="Send"]',
        'div[role="button"][aria-label*="Enviar"]',
        'button[role="button"][aria-label*="Send"]',
        'div[aria-label*="Send"]',
        'button:has(svg)',
        'form button'
      ];

      let clicked = false;
      for (const btnSel of sendBtnSelectors) {
        try {
          const btn = page.locator(btnSel).last();
          if (await btn.isVisible({ timeout: 1000 }) && await btn.isEnabled({ timeout: 500 })) {
            console.log(`👉 Haciendo clic en botón de envío: ${btnSel}`);
            await btn.click({ force: true });
            clicked = true;
            break;
          }
        } catch(e) {}
      }

      if (!clicked) {
        console.log('👉 Botón de envío no clickeable. Enviando mediante tecla Enter...');
        await page.keyboard.press('Enter');
      }
      
      await page.waitForTimeout(1000);
    }

    console.log('🎨 PASO 1: Solicitando generación de imagen a Meta AI...');
    await sendPrompt(imagePrompt);
    console.log('✅ Prompt de imagen enviado.');

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
    await sendPrompt(textPrompt);
    await page.waitForTimeout(10000);

    // Extracción de JSON
    const content = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('.markdown, div[dir="auto"]'));
      return msgs.map(m => m.innerText).join('\n');
    });

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
      console.warn('⚠️ No se pudo extraer JSON de Meta AI, usando fallback.');
      jsonParsed = {
        frase: selectedTopicText.substring(0, 30).toUpperCase(),
        copy: `El éxito en el trading se construye con paciencia. En TradeShare te damos las herramientas para dominar los mercados. Comenta ${activeKeyword} para más info.`
      };
    }

    // Localizar Imagen con filtrado por tamaño
    console.log('📥 Localizando imagen generada con alta fidelidad...');
    let imgSrc = null;
    const imgs = page.locator('img');
    const count = await imgs.count();
    
    for (let i = count - 1; i >= 0; i--) {
      const img = imgs.nth(i);
      const src = await img.getAttribute('src');
      
      if (src && (src.includes('scontent') || src.includes('meta.ai') || src.includes('fbcdn'))) {
        // Verificar dimensiones para evitar miniaturas
        const box = await img.boundingBox();
        if (box && box.width > 400) {
          imgSrc = src;
          console.log(`✅ Imagen de alta resolución encontrada: ${box.width}x${box.height}`);
          break;
        }
      }
    }

    if (!imgSrc) {
      console.log('⚠️ No se filtró imagen por tamaño, buscando cualquier imagen de Meta...');
      for (let i = count - 1; i >= 0; i--) {
        const src = await imgs.nth(i).getAttribute('src');
        if (src && (src.includes('scontent') || src.includes('fbcdn'))) {
          imgSrc = src;
          break;
        }
      }
    }

    if (!imgSrc) throw new Error('No se localizó la imagen generada.');

    const response = await page.request.get(imgSrc);
    const buffer = await response.body();
    const fileName = `trading_post_meta_snap_${Date.now()}.png`;
    const localPath = path.join(ROOT, 'public', 'images', 'historias', fileName);
    
    if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
    console.log(`💾 Guardada: ${localPath}`);

    const todayStr = new Date().toISOString().split('T')[0];
    const vaultEntry = {
      id: `vault_${Date.now()}`,
      date: todayStr,
      timestamp: Date.now(),
      frase: jsonParsed.frase,
      copy: jsonParsed.copy,
      imagenUrl: `/images/historias/${fileName}`,
      communitySlug: args.community ? 'forex-traders-hub' : null,
      communityPostUrl: null,
      instagramFeedUrl: null,
      instagramStoryPosted: false
    };

    // Publicar LOCALMENTE
    if (args.publish !== 'false' && args.publish !== false) {
      console.log('🔍 Publicando Localmente...');
      const target = args.community ? 'community' : 'feed';
      const postId = addToLocalPortalFeed(target, `/images/historias/${fileName}`, jsonParsed.copy, userId);
      const communityPostUrl = `http://localhost:5680/local-portal/posts/${postId}`;
      vaultEntry.communityPostUrl = communityPostUrl;
      console.log(`🎉 Publicado en Portal Local (${target}): ${communityPostUrl}`);
    } else {
      console.log('⏭️ Saltando publicación local en portal (se guarda directamente en bóveda programada)');
    }

    // Registrar en la Bóveda de Contenidos (.agent/marketing_vault.json)
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

  } catch (err) {
    console.error('❌ Error fatal:', err.message);
    await page.screenshot({ path: 'public/generated_posts/error-meta-ai.png' });
  } finally {
    if (browser) {
      if (isPlaywriter) {
        console.log('🔌 Desconectando de Playwriter (dejando el navegador real abierto)...');
        await browser.close().catch(() => {});
      } else {
        await browser.close().catch(() => {});
      }
    }
    process.exit(0);
  }
}

generateMetaAI();
