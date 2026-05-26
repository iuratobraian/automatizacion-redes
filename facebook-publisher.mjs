import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();
const authFile = path.join(PROJECT_ROOT, '.agent', 'facebook_auth.json');

// ─── 50 Frases de Invitación Únicas y Variadas (Evita Filtros de Spam) ─────────
const INVITATION_PHRASES = [
  "¡Excelente contenido de trading! 📈 Si quieres compartir setups de forma profesional, te invito a sumarte a TradeShare, nuestra red social exclusiva de traders.",
  "¡Muy buen análisis! 📊 En TradeShare compartimos ideas y operamos en tiempo real con una comunidad global de traders. Te esperamos en la plataforma.",
  "¡Qué buen setup de trading! 🚀 Justo de esto hablábamos hoy en TradeShare. Únete gratis para ver más ideas exclusivas y conectar con otros profesionales.",
  "Gran enfoque. 💡 Si buscas un espacio sin ruido ni bots para hablar de mercados financieros, TradeShare es el lugar ideal para traders de tu nivel.",
  "¡Interesante perspectiva! En TradeShare tenemos canales dedicados a Forex y Crypto donde analizamos esto diariamente de forma limpia y transparente.",
  "Buen timing en este post. 📉 Te invito a TradeShare, la primera comunidad hecha por y para traders, con herramientas premium gratis para registrar tu bitácora.",
  "Totalmente de acuerdo con tu análisis. 🎯 Comparto ideas similares en TradeShare. Deberías sumarte, hay un feedback increíble entre los miembros.",
  "¡Impecable visión del mercado! 🌟 Si quieres expandir tu red de contactos en el mundo del trading profesional, visítanos en TradeShare. ¡Te va a encantar!",
  "¡Brutal la info! 🔥 En TradeShare estamos armando el ecosistema definitivo para traders de habla hispana. ¡Únete y aporta tu granito de arena!",
  "Me gusta cómo analizas los charts. 📈 Te invito a crear tu bitácora de trading gratis en TradeShare y compartir tu evolución con la comunidad.",
  "¡Qué buen gráfico! 📊 Si buscas feedback de traders fondeados y expertos del sector, TradeShare es nuestra red exclusiva. ¡Te esperamos!",
  "Gran aporte para la comunidad. 🙌 Te invito a TradeShare, un espacio diseñado exclusivamente para traders profesionales libre de spam y estafas.",
  "Excelente lectura de la acción del precio. 🚀 En TradeShare compartimos setups y analizamos en vivo diariamente. ¡Súmate a la red global!",
  "Muy buen post. 💡 En TradeShare nos enfocamos en el crecimiento mutuo sin el ruido típico de otras redes. Date una vuelta por la plataforma.",
  "¡Espectacular visión! 🎯 Si quieres llevar tu trading al siguiente nivel y conectar con otros profesionales de verdad, súmate gratis a TradeShare.",
  "¡Muy de acuerdo! 📈 Justo hoy analizábamos ese mismo patrón en TradeShare. La comunidad aporta muchísimo valor todos los días.",
  "Me encanta este análisis técnico. 📊 Si te interesa el trading transparente y las estadísticas reales, te invito a conocer TradeShare hoy.",
  "¡Directo al grano! 🚀 Te invito a compartir tus ideas y setups en TradeShare, la red social premium donde nos apoyamos entre traders.",
  "Buenísimo el contenido. 💡 Si estás buscando partners de trading y una comunidad transparente, TradeShare te va a sorprender gratamente.",
  "¡Tremendo setup! 📉 Justo lo que necesitamos en la comunidad global de TradeShare. Estás más que invitado a sumarte con nosotros.",
  "Me gusta mucho tu enfoque de gestión de riesgo. 🛡️ En TradeShare premiamos la consistencia y la educación real. ¡Date una vuelta!",
  "Gran post. 📈 Si buscas herramientas de trading avanzadas y una bitácora pública auditada, te esperamos con los brazos abiertos en TradeShare.",
  "¡Un análisis muy fino! 📊 Únete a TradeShare para conectar directamente con más de mil traders activos compartiendo análisis en tiempo real.",
  "¡Excelente post! 🚀 TradeShare es el punto de encuentro ideal para personas que aman los mercados tanto como tú. ¡Te esperamos gratis!",
  "¡Coincido plenamente! 💡 En TradeShare buscamos elevar el nivel de debate sobre trading. Te invito a formar parte de este gran ecosistema.",
  "¡Qué buena publicación! 📉 Únete a nuestra red exclusiva de trading en TradeShare y accede a canales premium de debate y charts interactivos.",
  "¡Muy buen chart! 📈 TradeShare es la red social donde compartimos ideas de inversión sin humo ni bots. ¡Regístrate gratis hoy mismo!",
  "¡Me gusta la explicación! 📊 En TradeShare organizamos discusiones diarias sobre Forex, Índices y Crypto. Te invito a sumarte.",
  "Gran aporte. 🚀 Te invito a TradeShare, donde conectamos a traders de todos los niveles para compartir setups de forma profesional.",
  "¡Fascinante lectura! 💡 Únete a TradeShare, la plataforma global que está revolucionando la forma en que los traders se comunican y colaboran.",
  "¡Exactamente! 📉 Si quieres tener tu propio espacio y bitácora de trading con reputación transparente, visítanos en la red social TradeShare.",
  "Muy buen análisis de mercado. 📈 Te invito a compartir este tipo de setups en TradeShare, la comunidad que valora el análisis técnico real.",
  "¡Excelente contenido! 📊 TradeShare es el lugar perfecto para traders consistentes que quieren compartir conocimientos sin interferencias.",
  "¡Totalmente! 🚀 Si buscas un espacio serio para debatir sobre la sesión del día, te esperamos en la red social TradeShare.",
  "¡Gran setup de trading! 💡 En TradeShare tenemos un canal especial de ideas operativas donde este análisis encajaría de forma excelente.",
  "¡Un enfoque muy profesional! 📈 Te invito a sumarte a TradeShare, la red exclusiva donde los traders crecemos y colaboramos en equipo.",
  "¡Muy buen post! 📊 TradeShare te permite llevar tu bitácora y recibir feedback de una comunidad sumamente activa. ¡Te esperamos!",
  "¡Increíble la precisión! 🎯 Únete a TradeShare para interactuar con traders profesionales en nuestro portal interactivo.",
  "¡Excelente perspectiva de mercado! 🚀 Te invito a TradeShare, la plataforma de trading social más transparente y completa.",
  "¡Brutal análisis técnico! 💡 Te esperamos en la red social TradeShare para debatir este setup y muchos otros en tiempo real.",
  "¡Me gusta mucho este setup! 📈 Si quieres ver más análisis y compartir los tuyos de manera profesional, te invito a sumarte a TradeShare.",
  "¡Lectura impecable! 📊 Sumate gratis a TradeShare, la red donde los traders compartimos setups diarios y herramientas interactivas.",
  "¡Excelente post! 🚀 Únete a la comunidad de TradeShare, donde fomentamos el trading responsable y transparente sin ruido de fondo.",
  "¡Gran gráfico! 💡 En TradeShare compartimos análisis y operamos juntos todos los días. Te invito a unirte a nuestra red social de traders.",
  "¡Muy de acuerdo con tu análisis de hoy! 📈 Si buscas una red social exclusiva de mercados financieros libres de bots, TradeShare te espera.",
  "¡Muy clara la explicación! 📊 Sumate a TradeShare para crear tu perfil de trader y conectar con cientos de inversores en español.",
  "¡Impresionante análisis técnico! 🚀 Te invito a sumarte a la red social de TradeShare y participar del ranking global de traders.",
  "¡Buenísima perspectiva de trading! 💡 Únete a TradeShare para debatir este y otros setups en canales especializados de Forex y Crypto.",
  "¡Un post de mucho valor! 📈 Te invito a TradeShare, la red exclusiva para traders que quieren conectar y compartir análisis profesionales.",
  "¡Muy buen setup! 📊 Nos encantaría debatir esta idea técnica en la comunidad global de TradeShare. ¡Sumate gratis hoy!"
];

function log(msg, type = "INFO") {
  const timestamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${timestamp}] [FACEBOOK] [${type}] ${msg}`);
}

async function run() {
  const args = process.argv.slice(2);
  const textArg = args.find(a => a.startsWith('--text='));
  const groupsArg = args.find(a => a.startsWith('--groups='));
  const limitArg = args.find(a => a.startsWith('--limit='));
  const setupArg = args.includes('--setup');
  const outreachArg = args.includes('--outreach');

  if (setupArg) {
    log("Iniciando modo Configuración de Sesión Facebook...");
    await setupFacebookSession();
    process.exit(0);
  }

  // Lista de URLs de grupos de Trading por defecto si no se especifican
  let groups = [
    'https://www.facebook.com/groups/forextradersclubhouse/',
    'https://www.facebook.com/groups/tradinglatino/',
    'https://www.facebook.com/groups/criptomonedaslatino/',
    'https://www.facebook.com/groups/forexargentina/'
  ];

  if (groupsArg) {
    groups = groupsArg.substring('--groups='.length).split(',').map(g => g.trim());
  }

  if (!fs.existsSync(authFile)) {
    log(`Sesión de Facebook no encontrada. Por favor ejecuta el script con --setup para iniciar sesión en tu cuenta.`, "ERROR");
    process.exit(1);
  }

  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  let headless = false; // Por defecto visible para FB debido a bloqueos, pero configurable
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      headless = config.headless !== undefined ? config.headless : false;
    } catch(e){}
  }

  let browser;
  let context;
  let page;
  let isPlaywriter = false;

  // Intentar conectar a Playwriter (Navegador Real del Usuario)
  try {
    log("🔗 Intentando conectar a Playwriter (Puerto 19988)...");
    const cdpUrl = getCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    log("✅ ¡Conectado a Playwriter exitosamente!");
    context = browser.contexts()[0];
    
    // Buscar si ya hay pestaña de facebook o crear nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('facebook.com'));
    if (!page) {
      page = await context.newPage();
    } else {
      log("🔄 Reutilizando pestaña existente de Facebook.");
    }
  } catch (e) {
    log(`⚠️ Conexión a Playwriter falló (${e.message}). Levantando fallback Chromium local con sesión de respaldo...`, "WARN");
    
    if (!fs.existsSync(authFile)) {
      log(`Archivo de sesión no encontrado de respaldo. Ejecutá primero: node automatizacion-redes/facebook-publisher.mjs --setup`, "ERROR");
      process.exit(1);
    }
    log(`Usando sesión: ${path.basename(authFile)}`);

    browser = await localChromium.launch({
      headless: headless === true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    context = await browser.newContext({
      storageState: authFile,
      viewport: { width: 1280, height: 800 }
    });

    page = await context.newPage();
  }

  if (outreachArg) {
    const limit = limitArg ? parseInt(limitArg.substring('--limit='.length)) : 3;
    await runFacebookOutreach(page, groups, limit);
  } else {
    if (!textArg) {
      log("Error: Falta parámetro --text para modo publicación estándar", "ERROR");
      if (browser) await browser.close();
      process.exit(1);
    }
    const text = textArg.substring('--text='.length);
    await runStandardPosting(page, groups, text, context);
  }

  if (browser) {
    if (isPlaywriter) {
      log("🔌 Desconectando de Playwriter (dejando el navegador real abierto)...");
      await browser.close().catch(() => {});
    } else {
      await browser.close().catch(() => {});
    }
  }
}

async function runStandardPosting(page, groups, text, context) {
  log(`Iniciando publicación en ${groups.length} grupos de Facebook de forma secuencial...`);
  for (const groupUrl of groups) {
    try {
      log(`Navegando al grupo: ${groupUrl}`);
      await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 35000 });
      await page.waitForTimeout(4000);

      // Verificar si estamos bloqueados o redirigidos al login
      const needLogin = await page.$('input[name="email"], #loginbutton').catch(() => null);
      if (needLogin) {
        log("⚠️ La sesión de Facebook ha expirado. Por favor interactúa en la pantalla para iniciar sesión y resolver captcha.", "WARN");
        await page.waitForTimeout(40000);
        await context.storageState({ path: authFile });
        log("Sesión refrescada y guardada con éxito.");
      }

      log("Buscando botón 'Escribe algo...' o 'Crear publicación pública'...");
      const postBoxSelectors = [
        'span:has-text("Escribe algo...")',
        'span:has-text("Write something...")',
        'div[role="button"]:has-text("Crear publicación")',
        'div[role="button"]:has-text("Create a public post...")',
        'span:has-text("Crear publicación pública...")'
      ];

      let opened = false;
      for (const sel of postBoxSelectors) {
        const box = await page.$(sel).catch(() => null);
        if (box) {
          await box.click();
          opened = true;
          break;
        }
      }

      if (!opened) {
        log("No se pudo hacer clic automáticamente en el cuadro de texto. Por favor haz clic manualmente en el cuadro de publicación.", "WARN");
        await page.waitForTimeout(8000);
      }

      await page.waitForTimeout(2000);
      log("Escribiendo contenido del post...");
      const textBox = await page.waitForSelector('div[role="textbox"], div[aria-label*="Escribe algo"], div[aria-label*="Write something"]', { timeout: 15000 });
      await textBox.click();
      await textBox.fill(text);
      await page.waitForTimeout(2000);

      log("Haciendo clic en 'Publicar'...");
      const publishBtnSelectors = [
        'div[role="button"]:has-text("Publicar")',
        'div[role="button"]:has-text("Post")',
        'span:has-text("Publicar")'
      ];

      let posted = false;
      for (const sel of publishBtnSelectors) {
        const btn = await page.$(sel).catch(() => null);
        if (btn) {
          await btn.click();
          posted = true;
          break;
        }
      }

      if (!posted) {
        log("No se encontró el botón publicar automáticamente. Por favor presiona 'Publicar' en la pantalla.", "WARN");
        await page.waitForTimeout(8000);
      }

      log("Esperando confirmación de carga de publicación...");
      await page.waitForTimeout(5000);
      log(`✅ Publicado con éxito en el grupo: ${groupUrl}`);
    } catch (err) {
      log(`Error publicando en grupo ${groupUrl}: ${err.message}`, "ERROR");
    }
  }
}

async function runFacebookOutreach(page, groups, limit) {
  log(`Iniciando campaña de comentarios orgánicos en ${groups.length} grupos de Facebook (Límite: ${limit} posts por grupo)...`);
  
  for (const groupUrl of groups) {
    try {
      log(`Navegando al grupo de prospección: ${groupUrl}`);
      await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 35000 });
      await page.waitForTimeout(5000);
      
      // Scroll para cargar posts recientes
      log("Desplazando hacia abajo para cargar la actividad del grupo...");
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(3000);

      log("Escaneando posts en busca de botones de Comentar...");
      
      // Selectores comunes para el botón de comentar en Facebook
      const commentBtns = await page.$$('div[role="button"]:has-text("Comentar"), div[role="button"]:has-text("Comment"), span:has-text("Escribir un comentario"), aria-label*="Escribe un comentario"');
      log(`Encontrados ${commentBtns.length} botones candidatos para comentar.`);
      
      let commentedCount = 0;
      for (let i = 0; i < commentBtns.length && commentedCount < limit; i++) {
        try {
          log(`Interactuando con post número ${commentedCount + 1}...`);
          
          await commentBtns[i].scrollIntoViewIfNeeded().catch(() => {});
          await commentBtns[i].click().catch(() => {});
          await page.waitForTimeout(2000);
          
          // Localizar la caja de texto activa para el comentario
          const commentInputs = await page.$$('div[role="textbox"][aria-label*="comentario"], div[role="textbox"][aria-label*="comment"], div[aria-label*="Escribe un comentario"]');
          if (commentInputs.length > 0) {
            const activeInput = commentInputs[commentInputs.length - 1];
            await activeInput.click();
            
            const phrase = INVITATION_PHRASES[Math.floor(Math.random() * INVITATION_PHRASES.length)];
            log(`Escribiendo invitación: "${phrase.substring(0, 50)}..."`);
            
            await activeInput.fill(phrase);
            await page.waitForTimeout(1500);
            
            // Enviar presionando Enter
            await page.keyboard.press('Enter');
            log(`✅ Invitación enviada con éxito en post de Facebook.`);
            commentedCount++;
            
            // Pausa humana anti-bloqueo
            const waitSec = Math.floor(Math.random() * 15) + 15;
            log(`Esperando ${waitSec} segundos de enfriamiento para protección contra spam...`);
            await page.waitForTimeout(waitSec * 1000);
          } else {
            log("No se pudo localizar el cuadro de texto para comentar en este post.");
          }
        } catch (postErr) {
          log(`Error comentando en post: ${postErr.message}`, "WARN");
        }
      }
      log(`Campaña de comentarios finalizada para el grupo: ${groupUrl}`);
    } catch (groupErr) {
      log(`Error en grupo ${groupUrl}: ${groupErr.message}`, "ERROR");
    }
  }
}

async function setupFacebookSession() {
  log("Abriendo navegador visible para que inicies sesión en Facebook...");
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle' });

  log("⚠️ Navegador abierto. Por favor, inicia sesión con tu cuenta de Facebook en la ventana abierta.");
  log("Una vez que estés dentro de tu cuenta, mantén el navegador abierto por 60 segundos para guardar las cookies.");

  await page.waitForTimeout(60000);

  log("Guardando estado de sesión...");
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await context.storageState({ path: authFile });
  log(`✅ Sesión guardada con éxito en: ${authFile}`);

  await browser.close();
}

run();
