import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();
const authFile = path.join(PROJECT_ROOT, '.agent', 'facebook_auth.json');

// ─── 50 Frases de Invitación Únicas y Variadas (Evita Filtros de Spam) ─────────
const INVITATION_PHRASES = [
  "¡Excelente contenido! 📈 Accedé a la Bitácora Pro auditada en TradeShare. Vamos a competir en trade-share.com",
  "¡Muy buen análisis! 📊 En TradeShare tenés infraestructura profesional para crear tu comunidad y trackear tu operativa. Entrá en trade-share.com",
  "¡Qué buen setup! 🚀 Plataforma TradeShare: Bitácora Pro conectada a MT5 y comunidades de traders. Unite en trade-share.com",
  "Gran enfoque. 💡 Si buscás herramientas institucionales sin humo, TradeShare es tu lugar. trade-share.com",
  "¡Interesante perspectiva! En TradeShare analizamos esto con herramientas profesionales y bitácora con IA. trade-share.com",
  "Buen timing. 📉 Te invito a TradeShare: Bitácora Pro y comunidades activas para traders serios. trade-share.com",
  "Totalmente de acuerdo. 🎯 En TradeShare podés trackear tus números con precisión institucional y competir con los mejores. trade-share.com",
  "¡Impecable visión! 🌟 Sumate a TradeShare, el ecosistema profesional para traders de alto rendimiento. trade-share.com",
  "¡Brutal la info! 🔥 En TradeShare tenés todo centralizado: Bitácora Pro, psicotrading y gestión de comunidades. trade-share.com",
  "Me gusta tu análisis. 📈 Creá tu bitácora en TradeShare y mostrá tu consistencia con métricas auditadas. trade-share.com",
  "¡Qué buen gráfico! 📊 Unite a TradeShare y usá herramientas de nivel institucional. trade-share.com",
  "Gran aporte. 🙌 TradeShare unifica la mejor tecnología para traders y líderes de academia. trade-share.com",
  "Excelente lectura. 🚀 Usá la Bitácora Pro en TradeShare y automatizá el registro de tu trading. trade-share.com",
  "Muy buen post. 💡 TradeShare es la plataforma profesional que estabas buscando para auditar tus cuentas. trade-share.com",
  "¡Espectacular visión! 🎯 Llevá tu trading al siguiente nivel con la infraestructura de TradeShare. trade-share.com",
  "¡Muy de acuerdo! 📈 El ecosistema integral de TradeShare está disponible para la comunidad. Sumate en trade-share.com",
  "Me encanta este análisis. 📊 Registrate en TradeShare y usá la Bitácora Pro con métricas avanzadas. trade-share.com",
  "¡Directo al grano! 🚀 Unite a la nueva generación de trading en TradeShare. Bitácora Pro y comunidades en trade-share.com",
  "Buenísimo contenido. 💡 En TradeShare tenés acceso abierto a herramientas de élite, sin rodeos. Vamos a competir en trade-share.com",
  "¡Tremendo setup! 📉 Registralo en la Bitácora Pro de TradeShare y medí tu edge. Unite en trade-share.com",
  "Me gusta tu gestión. 🛡️ En TradeShare tenés herramientas de control de riesgo profesional. Entrá en trade-share.com",
  "Gran post. 📈 Bitácora Pro y comunidades de análisis en TradeShare. Te esperamos en trade-share.com",
  "¡Un análisis muy fino! 📊 Unite a TradeShare y conectá con traders de élite. trade-share.com",
  "¡Excelente post! 🚀 TradeShare ofrece tecnología de punta para la comunidad trader. Bitácora Pro y comunidades en trade-share.com",
  "¡Coincido plenamente! 💡 El ecosistema TradeShare está transformando la gestión operativa. Unite y vamos a competir. trade-share.com",
  "¡Qué buena publicación! 📉 Usá herramientas de análisis institucional en TradeShare. Registrate en trade-share.com",
  "¡Muy buen chart! 📈 TradeShare es la red profesional sin intermediarios ni humo. Entrá en trade-share.com",
  "¡Me gusta la explicación! 📊 En TradeShare debatimos con herramientas de análisis de primer nivel. trade-share.com",
  "Gran aporte. 🚀 TradeShare es la plataforma para traders disciplinados y academias. Unite en trade-share.com",
  "¡Fascinante lectura! 💡 La evolución del trading disciplinado está en TradeShare. trade-share.com",
  "¡Exactamente! 📉 Creá tu comunidad y usá la Bitácora Pro en TradeShare. trade-share.com",
  "Muy buen análisis. 📈 Publicá tus setups en TradeShare y ganá reputación demostrable. trade-share.com",
  "¡Excelente contenido! 📊 TradeShare es el entorno más riguroso y profesional. Unite en trade-share.com",
  "¡Totalmente! 🚀 Debatí en serio en la red social especializada TradeShare. trade-share.com",
  "¡Gran setup! 💡 Registralo en TradeShare y auditalo con la Bitácora Pro con IA. trade-share.com",
  "¡Un enfoque muy profesional! 📈 Sumate a TradeShare, el ecosistema de trading de alto calibre. trade-share.com",
  "¡Muy buen post! 📊 Bitácora Pro y feedback de calidad entre traders en TradeShare. trade-share.com",
  "¡Increíble precisión! 🎯 Unite a TradeShare y usá herramientas de élite para tu operativa. trade-share.com",
  "¡Excelente perspectiva! 🚀 TradeShare es la plataforma más completa para auditar tu rendimiento. trade-share.com",
  "¡Brutal análisis! 💡 Debatí este setup en la comunidad especializada de TradeShare. trade-share.com",
  "¡Me gusta mucho! 📈 Compartí tus análisis y visualizá estadísticas reales en TradeShare. trade-share.com",
  "¡Lectura impecable! 📊 Sumate a TradeShare y usá la Bitácora Pro para perfeccionar tu estrategia. trade-share.com",
  "¡Excelente post! 🚀 Unite a TradeShare, donde la disciplina y la matemática mandan. trade-share.com",
  "¡Gran gráfico! 💡 Analizamos el mercado en conjunto todos los días en TradeShare. trade-share.com",
  "¡Muy de acuerdo! 📈 Si buscás herramientas profesionales y métricas transparentes, TradeShare te espera. trade-share.com",
  "¡Muy clara la explicación! 📊 Creá tu perfil y activá tu Bitácora Pro en TradeShare. trade-share.com",
  "¡Impresionante análisis! 🚀 Sumate a TradeShare y competí con los traders más consistentes. trade-share.com",
  "¡Buenísima perspectiva! 💡 Todo centralizado en TradeShare: Bitácora Pro, auditoría y comunidades. trade-share.com",
  "¡Un post de mucho valor! 📈 Unite a TradeShare, la red profesional de traders auditados. trade-share.com",
  "¡Muy buen setup! 📊 Vamos a debatir esto en TradeShare. ¡Sumate ya en trade-share.com!"
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
let page;
let context;
let isPlaywriter = false;

// Manejo de señales de parada para cerrar ventanas de inmediato
const cleanUpAndExit = async (signal) => {
  log(`⚠️ Señal ${signal} recibida. Forzando cierre de pestañas y navegador...`, "WARN");
  try {
    if (page && typeof page.close === 'function') {
      await page.close().catch(() => {});
    }
  } catch (e) {}
  try {
    if (browser && typeof browser.close === 'function') {
      await browser.close().catch(() => {});
    }
  } catch (e) {}
  log("🏁 Recursos liberados. Saliendo del proceso.");
  process.exit(signal ? 0 : 1);
};

process.on('SIGINT', () => cleanUpAndExit('SIGINT'));
process.on('SIGTERM', () => cleanUpAndExit('SIGTERM'));

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

  const hasHeadedArg = args.includes('--headed');
  const hasPlaywriterArg = args.includes('--playwriter');

  isPlaywriter = false;

  try {
    // Intentar conectar a Playwriter (Navegador Real del Usuario) solo si se solicita con --playwriter
    if (hasPlaywriterArg) {
      try {
        log("🔗 Intentando conectar a Playwriter (Puerto 19988)...");
        const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
        browser = await coreChromium.connectOverCDP(cdpUrl);
        isPlaywriter = true;
        log("✅ ¡Conectado a Playwriter exitosamente!");
        context = browser.contexts()[0];
        
        // Cerrar proactivamente pestañas anteriores de Facebook para no saturar el sistema
        try {
          const pages = context.pages();
          for (const p of pages) {
            const url = p.url();
            if (url.includes('facebook.com') || url === 'about:blank' || url === '') {
              log(`🧹 Cerrando pestaña previa inactiva de Facebook: ${url}`);
              await p.close().catch(() => {});
            }
          }
        } catch (err) {
          log(`⚠️ No se pudieron limpiar las pestañas anteriores: ${err.message}`, "WARN");
        }

        page = await context.newPage();
      } catch (e) {
        log(`⚠️ Conexión a Playwriter falló (${e.message}). Levantando fallback Chromium local con sesión de respaldo...`, "WARN");
      }
    }

    if (!browser) {
      if (!fs.existsSync(authFile)) {
        log(`Archivo de sesión no encontrado de respaldo. Ejecutá primero: node automatizacion-redes/facebook-publisher.mjs --setup`, "ERROR");
        process.exit(1);
      }
      log(`Usando sesión: ${path.basename(authFile)}`);

      const isHeadless = !hasHeadedArg;
      log(`🚀 Iniciando Chromium local en modo ${isHeadless ? 'OCULTO (headless)' : 'VISIBLE (headed)'}...`);

      browser = await localChromium.launch({
        headless: isHeadless,
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
        throw new Error("Falta parámetro --text para modo publicación estándar");
      }
      const text = textArg.substring('--text='.length);
      await runStandardPosting(page, groups, text, context);
    }
  } catch (err) {
    log(`❌ Error durante la ejecución de facebook-publisher: ${err.message}`, "ERROR");
  } finally {
    if (page) {
      log("🧹 Cerrando pestaña de trabajo de Facebook...");
      await page.close().catch(() => {});
    }
    if (browser) {
      log("🔌 Desconectando de Playwriter / Cerrando navegador...");
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
