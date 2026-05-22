import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();
const IG_ACCOUNT = process.env.IG_ACCOUNT || 'braiurato';
const threadsAuthFile = path.join(PROJECT_ROOT, '.agent', `threads_auth_${IG_ACCOUNT}.json`);
const igAuthFile = path.join(PROJECT_ROOT, '.agent', `instagram_auth_${IG_ACCOUNT}.json`);
// Prefer dedicated Threads session; fall back to IG session
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
  const text = textArg.substring('--text='.length);

  log(`Preparando publicación en Threads: "${text.slice(0, 50)}..."`);

  if (!fs.existsSync(authFile)) {
    log(`Archivo de sesión no encontrado. Ejecutá primero: node automatizacion-redes/threads-setup-session.mjs`, "ERROR");
    process.exit(1);
  }
  log(`Usando sesión: ${path.basename(authFile)}`);

  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  let headless = true;
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      headless = config.headless !== undefined ? config.headless : true;
    } catch(e){}
  }

  const browser = await chromium.launch({
    headless: headless === true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Cargar cookies de sesión
  const context = await browser.newContext({
    storageState: authFile,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    log("Navegando a Threads.net...");
    await page.goto('https://www.threads.net/', { waitUntil: 'networkidle', timeout: 30000 });

    // Esperar un momento a que se aplique la sesión
    await page.waitForTimeout(3000);

    // Verificar si estamos logueados o si pide login
    const isLoggedIn = await page.$('div[role="button"]:has-text("Start a thread"), div[aria-label="New thread"], [placeholder*="Start a thread"], div[role="button"]:has-text("Iniciar un hilo"), [placeholder*="Iniciar un hilo"]').catch(() => null);

    if (!isLoggedIn) {
      log("Sesión de Instagram no detectada automáticamente en Threads. Intentando hacer login con el botón de Instagram...", "WARN");
      const igLoginBtn = await page.$('div[role="button"]:has-text("Continue with Instagram"), button:has-text("Instagram"), div[role="button"]:has-text("Continuar con Instagram"), div[role="button"]:has-text("Iniciar sesión con Instagram")').catch(() => null);
      if (igLoginBtn) {
        await igLoginBtn.click();
        await page.waitForTimeout(5000);
        await context.storageState({ path: authFile });
        log("Sesión guardada tras conectar Threads con Instagram.");
      } else {
        log("No se pudo detectar el botón de login automático de Instagram en Threads.", "ERROR");
        await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', 'threads_login_error.png') });
        await browser.close();
        process.exit(1);
      }
    }

    log("Abriendo modal de nueva publicación...");
    // Buscar el placeholder o botón para iniciar un hilo
    const threadInputBtn = await page.waitForSelector('div[role="button"]:has-text("Start a thread"), div[aria-label="New thread"], [placeholder*="Start a thread"]', { timeout: 15000 });
    await threadInputBtn.click();
    await page.waitForTimeout(1000);

    log("Escribiendo el hilo...");
    const textarea = await page.waitForSelector('div[role="textbox"], textarea[placeholder*="Start a thread"]', { timeout: 10000 });
    await textarea.click();
    await textarea.fill(text);
    await page.waitForTimeout(1500);

    log("Haciendo clic en Publicar...");
    const postBtn = await page.waitForSelector('div[role="button"]:has-text("Post"), button:has-text("Post")', { timeout: 10000 });
    await postBtn.click();

    log("Esperando confirmación de publicación...");
    await page.waitForTimeout(5000);

    log("✅ Hilo publicado correctamente en Threads!");
  } catch (err) {
    log(`Error publicando en Threads: ${err.message}`, "ERROR");
    try {
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', 'threads_publish_error.png') });
    } catch(e){}
  } finally {
    await browser.close();
  }
}

run();
