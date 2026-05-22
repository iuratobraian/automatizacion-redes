import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { ConvexClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { getRotatingPrompt } from './prompt-library.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'chatgpt_auth.json');
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

async function generatePost() {
  console.log('🤖 Iniciando Generación de Post del Día con ChatGPT...');
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
    const tradingTopics = [
      {
        tema: "Disciplina y Plan de Trading",
        desc: "la importancia crucial de seguir las reglas predefinidas del trading, esperar pacientemente a que se cumplan las confluencias de tu estrategia antes de operar, evitar el overtrading irracional, y recordar que en los mercados la paciencia paga con creces."
      },
      {
        tema: "Gestión de Riesgo y Preservación de Capital",
        desc: "proteger el capital a toda costa, utilizar siempre stop loss técnico bien calculado, entender la relación riesgo-beneficio (R:R mínimo 1:2 o 1:3), y asimilar que perder una operación individual es simplemente un costo operativo normal de este negocio."
      },
      {
        tema: "Psicología y Control Emocional del FOMO",
        desc: "superar la avaricia ciega y el miedo paralizante, evitar entrar tarde a un movimiento por emoción (FOMO - Fear of Missing Out), mantener la calma y la mente totalmente fría tanto en las rachas ganadoras como en los días de pérdidas."
      },
      {
        tema: "Consistencia y Hábitos de Largo Plazo",
        desc: "ver el trading como una maratón de consistencia y no un sprint de enriquecimiento rápido, el poder exponencial del interés compuesto, la disciplina diaria y el enfoque riguroso en el proceso analítico antes que en el resultado de dinero inmediato."
      },
      {
        tema: "Resiliencia Mental y Aprendizaje en el Trading",
        desc: "aprender de cada operación fallida, documentar y analizar los errores en la bitácora de trading como lecciones valiosas para el crecimiento, y desarrollar una resiliencia inquebrantable ante los inevitables ciclos de drawdown del mercado."
      }
    ];
    const selectedTopic = tradingTopics[Math.floor(Math.random() * tradingTopics.length)];
    selectedTopicText = `${selectedTopic.tema}: ${selectedTopic.desc}`;
    console.log(`🎯 Tema Generado: ${selectedTopic.tema}`);
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

  if (!fs.existsSync(STORAGE_STATE)) {
    console.error('❌ Error: No se encontró la sesión de ChatGPT. Corre "node scripts/chatgpt-auth.mjs" primero.');
    process.exit(1);
  }

  // 2. Conectar a Convex para obtener userId de "brai"
  const convexUrl = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || 'https://diligent-wildcat-523.convex.cloud';
  console.log(`🔌 Conectando con Convex en: ${convexUrl}`);
  const client = new ConvexClient(convexUrl);

  let userId = 'braiurato_admin'; // Fallback identificable
  try {
    const profile = await client.query(api.profiles.getProfileByUsuario, { usuario: 'braiurato' });
    if (profile?.userId) {
      userId = profile.userId;
      console.log(`👤 Autor del Post: braiurato (${userId})`);
    } else {
      console.warn('⚠️ No se encontró el perfil del usuario "braiurato" en Convex.');
    }
  } catch (err) {
    console.warn('⚠️ Error al obtener perfil de Convex:', err.message);
  }

  // 3. Abrir Playwright con evasión anti-detección
  const browser = await chromium.launch({ 
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  const context = await browser.newContext({ 
    storageState: STORAGE_STATE,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

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
      const stratPath = path.join(process.cwd(), '.agent', 'marketing_strategy.json');
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
    await page.waitForSelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]', { state: 'attached', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]', { state: 'hidden', timeout: 180000 });
    await page.waitForTimeout(5000);

    // 2. PASO 2: GENERAR TEXTO JSON
    const activeKeyword = strategy.comment_keywords[Math.floor(Math.random() * strategy.comment_keywords.length)];
    const textPrompt = `Excelente imagen. Ahora, basándote en ella y en el tema "${selectedTopicText}", genera el copy del post de forma magistral y muy persuasiva.
DEBES redactar el copy siguiendo la estrategia y el tono oficial de TradeShare:
- Tono: ${strategy.tone}
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

    console.log('📥 Descargando el buffer de imagen...');
    const response = await page.request.get(imgSrc);
    const buffer = await response.body();
    
    const timestamp = Date.now();
    const fileName = `trading_post_${timestamp}.png`;
    const localDir = path.join(process.cwd(), 'public', 'generated_posts');
    const localPath = path.join(localDir, fileName);

    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.writeFileSync(localPath, buffer);
    console.log(`💾 Imagen guardada con éxito en: ${localPath}`);

    // 6. Publicar Post en la Comunidad - Saltar si publish=false
    if (args.publish === 'false' || args.publish === false) {
      console.log('⏭️ Saltando publicación en Convex (--publish=false)');
      return;
    }

    console.log('🔍 Buscando la comunidad forex-traders-hub...');
    let community = null;
    try {
      community = await client.query(api.communities.getCommunity, { slug: 'forex-traders-hub' });
    } catch (e) {
      console.warn('⚠️ Error al buscar la comunidad forex-traders-hub:', e.message);
    }

    let communityPostUrl = 'http://localhost:3000/comunidad/forex-traders-hub';
    let createdPostId = null;

    if (community) {
      console.log(`✅ Comunidad encontrada: "${community.name}" (ID: ${community._id})`);
      console.log('🚀 Publicando en el feed de la Comunidad /comunidad/forex-traders-hub...');
      try {
        createdPostId = await client.mutation(api.communities.createPost, {
          communityId: community._id,
          contenido: jsonParsed.copy,
          titulo: jsonParsed.frase,
          imagenUrl: `/generated_posts/${fileName}`,
          userId: userId,
          tipo: 'text',
          categoria: 'Mentalidad'
        });
        communityPostUrl = `http://localhost:3000/comunidad/forex-traders-hub/post/${createdPostId}`;
        console.log(`🎉 ¡Post de TradeShare publicado con éxito en la Comunidad! Link: ${communityPostUrl}`);
      } catch (err) {
        console.error('❌ Error al publicar en la comunidad, intentando publicación global:', err.message);
      }
    }

    // Fallback si la comunidad no existe o falla
    if (!createdPostId) {
      console.log('🚀 Publicando de forma global en el Portal...');
      const createdGlobalPost = await client.mutation(api.posts.createPost, {
        titulo: jsonParsed.frase,
        contenido: jsonParsed.copy,
        imagenUrl: `/generated_posts/${fileName}`,
        categoria: 'Mentalidad',
        userId: userId,
        isAiAgent: true
      });
      communityPostUrl = `http://localhost:3000/posts/${createdGlobalPost}`;
      console.log(`🎉 ¡Post publicado de forma global en el Portal! Link: ${communityPostUrl}`);
    }

    // 7. Registrar en la Bóveda de Contenidos (.agent/marketing_vault.json)
    const vaultPath = path.join(process.cwd(), '.agent', 'marketing_vault.json');
    let vault = [];
    if (fs.existsSync(vaultPath)) {
      try {
        vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      } catch (e) {
        vault = [];
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const vaultEntry = {
      id: `vault_${Date.now()}`,
      date: todayStr,
      timestamp: Date.now(),
      frase: jsonParsed.frase,
      copy: jsonParsed.copy,
      imagenUrl: `/generated_posts/${fileName}`,
      communitySlug: community ? 'forex-traders-hub' : null,
      communityPostUrl: communityPostUrl,
      instagramFeedUrl: null, // Se rellenará tras publicar en Instagram
      instagramStoryPosted: false
    };

    vault.push(vaultEntry);
    fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
    console.log('💾 ¡Post registrado con éxito en la Bóveda de Contenidos!');

    // 8. Retornar los datos para la interfaz o puente
    console.log(`SUCCESS: Post creado: "${jsonParsed.frase}" en ${communityPostUrl}`);

  } catch (error) {
    success = false;
    console.error('❌ Error durante la generación:', error.message);
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'generated_posts', 'debug_chatgpt.png') });
      console.log('📸 Captura de pantalla de depuración guardada en public/generated_posts/debug_chatgpt.png');
    } catch (e) {
      console.error('⚠️ No se pudo tomar la captura de pantalla de depuración:', e.message);
    }
  } finally {
    await browser.close();
    // Salir del proceso de forma limpia para evitar que ConvexClient mantenga el socket abierto indefinidamente
    process.exit(success ? 0 : 1);
  }
}

generatePost();
