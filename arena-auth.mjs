/**
 * arena-auth.mjs — Autenticación manual en Arena.ai
 * Abre el navegador para que el usuario inicie sesión en Arena.ai y guarda la sesión.
 * 
 * Uso: node automatizacion-redes/arena-auth.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORAGE_STATE = path.join(ROOT, '.agent', 'arena_auth.json');
const ARENA_URL = 'https://arena.ai/c/019e6960-0c5b-7b37-b168-bf8901592307';

if (!fs.existsSync(path.join(ROOT, '.agent'))) {
  fs.mkdirSync(path.join(ROOT, '.agent'), { recursive: true });
}

async function auth() {
  console.log('🔐 Iniciando autenticación en Arena.ai...');
  console.log('ℹ️  Se abrirá una ventana del navegador. Inicia sesión en Arena.ai y luego presiona Enter aquí.');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--start-maximized'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();
  await page.goto(ARENA_URL, { waitUntil: 'domcontentloaded' });

  console.log(`\n✅ Navegador abierto en: ${ARENA_URL}`);
  console.log('👉 Inicia sesión en Arena.ai (Google, email, etc.)');
  console.log('👉 Una vez que veas el chat funcionando, presiona ENTER aquí para guardar la sesión.\n');

  // Esperar a que el usuario presione Enter
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve();
    });
  });

  // Guardar sesión
  await context.storageState({ path: STORAGE_STATE });
  console.log(`\n✅ Sesión de Arena.ai guardada exitosamente en: ${STORAGE_STATE}`);

  await browser.close();
  console.log('✅ Arena.ai auth completada. Ya podés usar arena-generator.mjs.');
}

auth().catch(e => {
  console.error('❌ Error en arena-auth.mjs:', e.message);
  process.exit(1);
});
