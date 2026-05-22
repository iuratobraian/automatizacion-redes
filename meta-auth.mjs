import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'meta_auth.json');

const IPHONE_DEVICE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 428, height: 926 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
};

async function authMeta() {
  console.log('🚀 Iniciando navegador para Autenticación en Meta AI...');
  
  if (!fs.existsSync(path.dirname(STORAGE_STATE))) {
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false // Visible para que puedas loguearte
  });
  
  const context = await browser.newContext({ ...IPHONE_DEVICE });
  const page = await context.newPage();
  
  await page.goto('https://www.meta.ai/');
  
  console.log('--------------------------------------------------');
  console.log('👉 POR FAVOR, LOGUÉATE EN META AI (usa tu cuenta de FB/IG).');
  console.log('👉 UNA VEZ DENTRO DEL CHAT, CIERRA EL NAVEGADOR.');
  console.log('--------------------------------------------------');

  // Esperar a que el usuario se loguee y cierre el navegador
  return new Promise((resolve) => {
    browser.on('disconnected', async () => {
      console.log('✅ Navegador cerrado. Guardando estado de sesión...');
      // Nota: Para guardar el estado real, tendríamos que haber usado el context antes del cierre.
      // Pero Playwright no permite context.storageState() después de que el browser se desconecta.
      // Así que usamos un truco: vigilamos la URL o un selector de "entraste".
      resolve();
    });

    // Vigilancia activa del login
    const interval = setInterval(async () => {
      try {
        if (page.isClosed()) {
          clearInterval(interval);
          return;
        }
        const currentUrl = page.url();
        // Si ya no estamos en login y hay indicadores de chat
        const isLogged = await page.evaluate(() => {
          return !!document.querySelector('textarea') || !!document.querySelector('[role="main"]');
        });

        if (isLogged && !currentUrl.includes('login')) {
          console.log('✨ Login detectado. Guardando sesión...');
          await context.storageState({ path: STORAGE_STATE });
          console.log(`✅ SESIÓN GUARDADA en .agent/meta_auth.json`);
          clearInterval(interval);
          await browser.close();
          resolve();
        }
      } catch (e) {}
    }, 3000);
  });
}

authMeta();
