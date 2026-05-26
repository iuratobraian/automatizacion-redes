import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');

let IG_ACCOUNT = 'braiurato';
if (fs.existsSync(CONFIG_PATH)) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    IG_ACCOUNT = config.selectedAccount || IG_ACCOUNT;
  } catch (e) {}
}

const threadsAuthFile = path.join(PROJECT_ROOT, '.agent', `threads_auth_${IG_ACCOUNT}.json`);
const igAuthFile = path.join(PROJECT_ROOT, '.agent', `instagram_auth_${IG_ACCOUNT}.json`);
const authFile = fs.existsSync(threadsAuthFile) ? threadsAuthFile : igAuthFile;

function log(msg, type = "INFO") {
  const timestamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${timestamp}] [THREADS] [${type}] ${msg}`);
}

async function run() {
  const args = process.argv.slice(2);
  const textArg = args.find(a => a.startsWith('--text='));
  if (!textArg) {
    log("Error: Falta parámetro --text", "ERROR");
    process.exit(1);
  }
  let text = textArg.substring('--text='.length);

  // Threads character limit safety (max 500 characters)
  if (text.length > 500) {
    log(`Advertencia: El texto excede el límite de 500 caracteres de Threads (${text.length} chars). Truncando elegantemente...`, "WARN");
    text = text.substring(0, 497) + "...";
  }

  log(`Preparando publicación en Threads: "${text.slice(0, 50)}..."`);

  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  let headless = true;
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      headless = config.headless !== undefined ? config.headless : true;
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
    
    // Buscar si ya hay pestaña de threads o crear nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('threads.net'));
    if (!page) {
      page = await context.newPage();
    } else {
      log("🔄 Reutilizando pestaña existente de Threads.");
    }
  } catch (e) {
    log(`❌ ERROR CRÍTICO: La conexión a Playwriter falló (${e.message}).`, "ERROR");
    log("👉 ES OBLIGATORIO utilizar tu navegador personal mediante Playwriter para esta operación.", "ERROR");
    log("👉 Por favor, asegúrate de que el daemon de Playwriter y PM2 estén activos y corriendo en el puerto 19988.", "ERROR");
    process.exit(1);
  }


  try {
    log("Navegando a Threads.net...");
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Esperar un momento a que se aplique la sesión
    await page.waitForTimeout(3000);

    // Verificar si estamos logueados o si pide login
    const isLoggedIn = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Perfil') || text.includes('Para ti') || text.includes('Buscar') || text.includes('Guardado') || text.includes('Publicar') || text.includes('Start a thread') || text.includes('Iniciar un hilo') || text.includes('novedades');
    });

    if (!isLoggedIn) {
      log("Sesión de Instagram no detectada automáticamente en Threads. Intentando hacer login con el botón de Instagram...", "WARN");
      const igLoginBtn = await page.$('div[role="button"]:has-text("Continue with Instagram"), button:has-text("Instagram"), div[role="button"]:has-text("Continuar con Instagram"), div[role="button"]:has-text("Iniciar sesión con Instagram")').catch(() => null);
      if (igLoginBtn) {
        await igLoginBtn.click({ force: true }).catch(async () => {
          await page.evaluate(el => el.click(), igLoginBtn);
        });
        log("Esperando a que la sesión se autorice y cargue el feed principal...");
        await page.waitForSelector('div[role="button"]:has-text("Start a thread"), div[aria-label="New thread"], [placeholder*="Start a thread"], div[role="button"]:has-text("¿Qué novedades tienes?"), [placeholder*="novedades"], div[role="button"]:has-text("Iniciar un hilo"), [placeholder*="hilo"]', { timeout: 25000 }).catch(() => null);
        await page.waitForTimeout(3000);
        await context.storageState({ path: authFile });
        log("Sesión guardada y validada tras conectar Threads con Instagram.");
      } else {
        log("No se pudo detectar el botón de login automático de Instagram en Threads.", "ERROR");
        await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', 'threads_login_error.png') });
        await browser.close();
        process.exit(1);
      }
    }

    log("Abriendo modal de nueva publicación...");
    try {
      const pinnedCreateClicked = await page.evaluate(() => {
        if (globalThis.playwriterPinnedElem1) {
          globalThis.playwriterPinnedElem1.click();
          return true;
        }
        return false;
      });
      if (pinnedCreateClicked) {
        log("✅ Modal de Threads abierto mediante elemento pinneado playwriterPinnedElem1.");
      } else {
        const threadInputBtn = await page.waitForSelector(
          'div[role="button"]:has-text("Start a thread"), div[aria-label="New thread"], [placeholder*="Start a thread"], div[role="button"]:has-text("¿Qué novedades tienes?"), [placeholder*="novedades"], div[role="button"]:has-text("Iniciar un hilo"), [placeholder*="hilo"]',
          { timeout: 8000 }
        );
        await threadInputBtn.click({ force: true }).catch(async () => {
          await page.evaluate(el => el.click(), threadInputBtn);
        });
      }
      await page.waitForTimeout(1000);
    } catch (e) {
      log("El modal de publicación ya está abierto o el botón se activó implícitamente.", "WARN");
    }

    log("Escribiendo el hilo...");
    const textarea = await page.waitForSelector('div[contenteditable="true"], div[role="textbox"], textarea[placeholder*="Start a thread"], textarea[placeholder*="novedades"], textarea', { timeout: 15000 });
    await textarea.click();
    await textarea.fill(text);
    await page.waitForTimeout(1500);

    log("Haciendo clic en Publicar...");
    const pinnedPublishClicked = await page.evaluate(() => {
      if (globalThis.playwriterPinnedElem2) {
        globalThis.playwriterPinnedElem2.click();
        return true;
      }
      return false;
    });
    if (pinnedPublishClicked) {
      log("✅ Publicado en Threads mediante elemento pinneado playwriterPinnedElem2.");
    } else {
      const postBtn = await page.waitForSelector(
        'div[role="button"]:has-text("Post"), button:has-text("Post"), div[role="button"]:has-text("Publicar"), button:has-text("Publicar")',
        { timeout: 10000 }
      );
      await postBtn.click({ force: true }).catch(async () => {
        await page.evaluate(el => el.click(), postBtn);
      });
    }

    log("Esperando confirmación de publicación...");
    await page.waitForTimeout(5000);

    log("✅ Hilo publicado correctamente en Threads!");
  } catch (err) {
    log(`Error publicando en Threads: ${err.message}`, "ERROR");
    try {
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', 'threads_publish_error.png') });
    } catch(e){}
  } finally {
    if (browser) {
      if (isPlaywriter) {
        log("🔌 Desconectando de Playwriter (dejando el navegador real abierto)...");
        await browser.close().catch(() => {});
      } else {
        await browser.close().catch(() => {});
      }
    }
  }
}

run();
