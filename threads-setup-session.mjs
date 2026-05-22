/**
 * threads-setup-session.mjs
 * Abre Threads.net en un navegador visible con la sesión de Instagram cargada.
 * Si Threads pide autorizar la cuenta de IG, el script hace clic automáticamente.
 * Al finalizar guarda la sesión de Threads para uso futuro.
 *
 * Uso: node automatizacion-redes/threads-setup-session.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const IG_ACCOUNT = process.env.IG_ACCOUNT || 'braiurato';
const igAuthFile = path.join(ROOT, '.agent', `instagram_auth_${IG_ACCOUNT}.json`);
const threadsAuthFile = path.join(ROOT, '.agent', `threads_auth_${IG_ACCOUNT}.json`);

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('es-AR')}] [THREADS-SETUP] ${msg}`);
}

async function main() {
  log(`🔑 Configurando sesión de Threads para @${IG_ACCOUNT}...`);

  if (!fs.existsSync(igAuthFile)) {
    log(`❌ Archivo de sesión de Instagram no encontrado: ${igAuthFile}`);
    log('   Primero ejecutá el login de Instagram desde el panel.');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    storageState: igAuthFile,
    viewport: { width: 1280, height: 800 },
    locale: 'es-AR',
  });

  const page = await context.newPage();

  log('🌐 Navegando a Threads.net...');
  await page.goto('https://www.threads.net/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Intentar conectar con Instagram automáticamente
  const loginSelectors = [
    'div[role="button"]:has-text("Continue with Instagram")',
    'div[role="button"]:has-text("Continuar con Instagram")',
    'div[role="button"]:has-text("Iniciar sesión con Instagram")',
    'div[role="button"]:has-text("Log in with Instagram")',
    'a:has-text("Instagram")',
  ];

  let clicked = false;
  for (const sel of loginSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0) {
        log(`🖱️  Clic en botón: "${sel}"`);
        await btn.click();
        await page.waitForTimeout(4000);
        clicked = true;
        break;
      }
    } catch {}
  }

  if (!clicked) {
    log('⚠️  No se encontró botón de login automático. Verifica la pantalla y acepta manualmente.');
    log('   El script esperará 90 segundos para que lo hagas manualmente...');
  } else {
    log('✅ Botón de conexión con Instagram pulsado.');
    log('   Si aparece una pantalla de confirmación, acéptala en la ventana.');
  }

  // Verificar si ya hay sesión activa (feed de Threads cargado)
  log('⏳ Esperando 10 segundos para que cargue la sesión...');
  await page.waitForTimeout(10000);

  const isLoggedIn = await page.$(
    'div[role="button"]:has-text("Start a thread"), [placeholder*="Start a thread"], div[role="button"]:has-text("Iniciar un hilo"), [placeholder*="Iniciar un hilo"]'
  ).catch(() => null);

  if (isLoggedIn) {
    log('🎉 ¡Sesión de Threads activa! Guardando...');
  } else {
    log('⚠️  La sesión no está completamente activa aún.');
    log('   Esperando 60 segundos más para que completes el login manualmente...');
    await page.waitForTimeout(60000);
  }

  // Guardar sesión de Threads
  await context.storageState({ path: threadsAuthFile });
  log(`💾 Sesión guardada en: ${threadsAuthFile}`);

  // También actualizar el archivo de sesión de IG con el estado fresco
  await context.storageState({ path: igAuthFile });
  log(`💾 Sesión de IG actualizada: ${igAuthFile}`);

  log('✅ Setup de Threads completado. Cerrando navegador en 3 segundos...');
  await page.waitForTimeout(3000);
  await browser.close();
}

main().catch((e) => {
  console.error('❌ Error fatal:', e.message);
  process.exit(1);
});
