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
const STORAGE_STATE = path.join(ROOT, '.agent', 'manus_auth.json');
const CONFIG_PATH = path.join(ROOT, '.agent', 'ig-config.json');

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
    
    // Buscar si ya hay una pestaña de manus abierta o crear una nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('manus.im'));
    if (!page) {
      page = await context.newPage();
    } else {
      console.log('🔄 Reutilizando pestaña existente de Manus.');
    }
  } catch (e) {
    console.error(`❌ ERROR CRÍTICO: La conexión a Playwriter falló (${e.message}).`);
    console.error('👉 ES OBLIGATORIO utilizar tu navegador personal mediante Playwriter para esta operación.');
    console.error('👉 Por favor, asegúrate de que el daemon de Playwriter y PM2 estén activos y corriendo en el puerto 19988.');
    process.exit(1);
  }

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
      const stratPath = path.join(ROOT, '.agent', 'marketing_strategy.json');
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

    async function sendPrompt(promptText) {
      console.log(`💬 Preparando para enviar prompt a Manus (${promptText.substring(0, 40)}...)...`);
      
      // Intentar primero a través de los elementos pinneados de Playwriter (CDP)
      const inputFocused = await page.evaluate((txt) => {
        if (globalThis.playwriterPinnedElem1) {
          globalThis.playwriterPinnedElem1.focus();
          if (globalThis.playwriterPinnedElem1.tagName === 'INPUT' || globalThis.playwriterPinnedElem1.tagName === 'TEXTAREA') {
            globalThis.playwriterPinnedElem1.value = txt;
          } else {
            globalThis.playwriterPinnedElem1.innerText = txt;
          }
          // Disparar evento de input
          globalThis.playwriterPinnedElem1.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      }, promptText);

      if (inputFocused) {
        console.log("  ✓ Prompt cargado con éxito en el input pinneado (playwriterPinnedElem1).");
        await page.waitForTimeout(1000);
      } else {
        const inputSelectors = [
          'textarea',
          '[contenteditable="true"]',
          '[role="textbox"]',
          '#prompt-textarea'
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
      }
      
      // Intentar enviar mediante el botón pinneado (playwriterPinnedElem2)
      const submitClicked = await page.evaluate(() => {
        if (globalThis.playwriterPinnedElem2) {
          globalThis.playwriterPinnedElem2.click();
          return true;
        }
        return false;
      });

      if (submitClicked) {
        console.log("  ✓ Formulario enviado con éxito vía botón pinneado (playwriterPinnedElem2).");
      } else {
        const sendBtnSelectors = [
          'button[aria-label*="Send"]',
          'button[aria-label*="Enviar"]',
          'div[role="button"][aria-label*="Send"]',
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
      }
      
      await page.waitForTimeout(1000);
    }

    await sendPrompt(prompt);

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

    // Localizar Imagen con máxima resiliencia
    let imgSrc = null;
    if (jsonParsed && (jsonParsed.imageUrl || jsonParsed.imagenUrl)) {
      const candidateUrl = jsonParsed.imageUrl || jsonParsed.imagenUrl;
      if (candidateUrl && candidateUrl.startsWith('http')) {
        imgSrc = candidateUrl;
        console.log(`🎯 URL de imagen obtenida directamente del JSON: ${imgSrc}`);
      }
    }

    if (!imgSrc) {
      console.log('🔍 Escaneando DOM en busca de la imagen generada (intentando hasta 12 veces con esperas de 4s)...');
      for (let attempt = 1; attempt <= 12; attempt++) {
        const imgs = page.locator('img');
        const count = await imgs.count();
        for (let i = count - 1; i >= 0; i--) {
          const src = await imgs.nth(i).getAttribute('src');
          if (src) {
            // Ignorar avatares pequeños, logos o favicons comunes
            const isLogoOrAvatar = src.includes('logo') || src.includes('avatar') || src.includes('profile') || src.includes('favicon') || src.includes('icon') || src.includes('arrow');
            if (!isLogoOrAvatar && (src.includes('blob:') || src.includes('manus') || src.includes('google') || src.includes('cdn') || src.includes('files.') || src.startsWith('data:image/'))) {
              imgSrc = src;
              console.log(`✨ ¡Imagen real localizada en el intento ${attempt}! DOM [${i}]: ${src}`);
              break;
            }
          }
        }
        if (imgSrc) break;
        console.log(`⏳ Intento ${attempt}/12 sin encontrar imagen. Esperando 4 segundos a que se genere...`);
        await page.waitForTimeout(4000);
      }
    }

    if (imgSrc) {
      console.log(`📥 Descargando imagen desde: ${imgSrc}`);
      let buffer;
      try {
        if (imgSrc.startsWith('data:image/')) {
          const base64Data = imgSrc.split(',')[1];
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          const response = await page.request.get(imgSrc);
          buffer = await response.body();
        }
      } catch (dlErr) {
        console.warn(`⚠️ Error descargando con Playwright (${dlErr.message}). Intentando fetch tradicional...`);
        try {
          const fetchRes = await fetch(imgSrc);
          buffer = Buffer.from(await fetchRes.arrayBuffer());
        } catch (fetchErr) {
          console.error(`❌ Falló la descarga de imagen completa: ${fetchErr.message}`);
        }
      }

      const fileName = `trading_post_manus_${Date.now()}.png`;
      const localPath = path.join(ROOT, 'public', 'images', 'feed', fileName);
      if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });

      if (buffer) {
        fs.writeFileSync(localPath, buffer);
        console.log(`💾 Imagen guardada con éxito: ${localPath}`);
      } else {
        console.warn('⚠️ No se pudo obtener buffer de imagen. Usando placeholder.');
        fs.copyFileSync(
          path.join(ROOT, 'public', 'images', 'feed', 'placeholder.png'),
          localPath
        );
      }

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

      if (args.publish !== 'false' && args.publish !== false) {
        const target = args.community ? 'community' : 'feed';
        const postId = addToLocalPortalFeed(target, `/images/feed/${fileName}`, jsonParsed.copy, userId);
        const communityPostUrl = `http://localhost:5680/local-portal/posts/${postId}`;
        vaultEntry.communityPostUrl = communityPostUrl;
        console.log(`🎉 Publicado Localmente en el Portal: ${communityPostUrl}`);
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
    }

  } catch (err) {
    success = false;
    console.error('❌ Error en Manus:', err.message);
  } finally {
    if (browser) {
      if (isPlaywriter) {
        console.log('🔌 Desconectando de Playwriter (dejando el navegador real abierto)...');
        // Para CDP, cerramos la pestaña si creamos una nueva, o simplemente cerramos la conexión
        await browser.close().catch(() => {});
      } else {
        await browser.close().catch(() => {});
      }
    }
    process.exit(success ? 0 : 1);
  }
}

generateManus();
