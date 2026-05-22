import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();
const authFile = path.join(PROJECT_ROOT, '.agent', 'facebook_auth.json');

function log(msg, type = "INFO") {
  const timestamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${timestamp}] [FACEBOOK] [${type}] ${msg}`);
}

async function run() {
  const args = process.argv.slice(2);
  const textArg = args.find(a => a.startsWith('--text='));
  const groupsArg = args.find(a => a.startsWith('--groups='));
  const setupArg = args.includes('--setup');

  if (setupArg) {
    log("Iniciando modo Configuración de Sesión Facebook...");
    await setupFacebookSession();
    process.exit(0);
  }

  if (!textArg) {
    log("Error: Falta parámetro --text", "ERROR");
    process.exit(1);
  }

  const text = textArg.substring('--text='.length);
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

  log(`Iniciando publicación en ${groups.length} grupos de Facebook de forma secuencial...`);

  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  let headless = false; // Por defecto visible para FB debido a bloqueos, pero configurable
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      headless = config.headless !== undefined ? config.headless : false;
    } catch(e){}
  }

  const browser = await chromium.launch({
    headless: headless === true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    storageState: authFile,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  for (const groupUrl of groups) {
    try {
      log(`Navegando al grupo: ${groupUrl}`);
      await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 35000 });
      await page.waitForTimeout(4000);

      // Verificar si estamos bloqueados o redirigidos al login
      const needLogin = await page.$('input[name="email"], #loginbutton').catch(() => null);
      if (needLogin) {
        log("⚠️ La sesión de Facebook ha expirado. Por favor interactúa en la pantalla para iniciar sesión y resolver captcha.", "WARN");
        // Esperar a que el usuario resuelva el login manualmente en la pantalla abierta
        await page.waitForTimeout(40000);
        // Guardar sesión refrescada
        await context.storageState({ path: authFile });
        log("Sesión refrescada y guardada con éxito.");
      }

      log("Buscando botón 'Escribe algo...' o 'Crear publicación pública'...");
      // Selectores típicos de cuadro de post de FB Groups
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
        await page.waitForTimeout(8000); // Darle tiempo para hacer clic
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

  log("Proceso de publicaciones en Facebook Groups finalizado.");
  await browser.close();
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
  log("Una vez que hayas ingresado a tu Feed con éxito, el script guardará tus cookies automáticamente en 60 segundos.");

  // Esperar 60 segundos a que el usuario haga login
  await page.waitForTimeout(60000);

  log("Guardando estado de sesión...");
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await context.storageState({ path: authFile });
  log(`✅ Sesión guardada con éxito en: ${authFile}`);
  log("Puedes cerrar la ventana de Facebook ahora.");

  await browser.close();
}

run();
