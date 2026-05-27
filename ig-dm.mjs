import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const args = process.argv.slice(2);
const senderArg = args.find(a => a.startsWith('--sender='))?.split('=')[1];
const filename = senderArg ? `instagram_auth_${senderArg}.json` : 'instagram_auth.json';
const STORAGE_STATE = path.join(process.cwd(), '.agent', filename);

const IPHONE_DEVICE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
};

async function sendDM(username, message) {
  if (!fs.existsSync(STORAGE_STATE)) {
    console.error('❌ ERROR: No se encontró sesión activa. Ejecuta "node scripts/ig-auth.mjs" primero.');
    process.exit(1);
  }

  console.log(`🤖 Aurora iniciando envío a @${username} (iPhone 12 Pro Max)...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    ...IPHONE_DEVICE,
    storageState: STORAGE_STATE 
  });
  const page = await context.newPage();

  try {
    // 1. Ir a la bandeja de entrada de mensajes
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    console.log(`Buscando conversación con @${username}...`);
    // Intentar abrir el modal de nuevo mensaje
    try {
      const newChatSelector = 'svg[aria-label="Nuevo mensaje"], svg[aria-label="New message"], [role="button"]:has(svg), button:has(svg)';
      const newChatBtn = page.locator(newChatSelector).first();
      await newChatBtn.click({ timeout: 5000 });
      console.log('Modal de nuevo mensaje abierto.');
    } catch (e) {
      console.log('No se pudo hacer clic en el botón de nuevo mensaje, intentando ir a /direct/new/');
      await page.goto('https://www.instagram.com/direct/new/', { waitUntil: 'domcontentloaded' });
    }

    // Esperar a la caja de búsqueda del modal
    const searchInputSelector = 'input[name="queryBox"], input[placeholder*="Buscar"], input[placeholder*="Search"]';
    await page.waitForSelector(searchInputSelector, { timeout: 10000 });
    await page.fill(searchInputSelector, username);
    console.log(`Buscando usuario: ${username}...`);
    await page.waitForTimeout(3000);

    // Hacer clic en el resultado usando click del DOM directo para asegurar disparo de navegación en React
    const clicked = await page.evaluate((uname) => {
      const rows = Array.from(document.querySelectorAll('div[role="button"]'));
      const userRow = rows.find(r => r.innerText.toLowerCase().includes(uname.toLowerCase()));
      if (userRow) {
        userRow.click();
        return true;
      }
      return false;
    }, username);

    if (clicked) {
      console.log(`Usuario @${username} seleccionado vía DOM click.`);
    } else {
      console.log(`Fallo al encontrar fila para @${username} en el DOM, intentando fallback...`);
      const userRowSelector = `div[role="dialog"] span:has-text("${username}"), span:has-text("${username}")`;
      await page.locator(userRowSelector).first().click({ timeout: 5000, force: true });
    }
    await page.waitForTimeout(5000);

    // Cerrar modal de login/confirmación si se presenta
    try {
      const closeSelector = 'svg[aria-label="Close"], svg[aria-label="Cerrar"], [role="dialog"] svg';
      const closeBtn = page.locator(closeSelector).first();
      await closeBtn.waitFor({ state: 'visible', timeout: 4000 });
      await closeBtn.click({ force: true });
      console.log('Modal de login/confirmación cerrado.');
    } catch (e) {
      console.log('No se detectó modal de login/confirmación visible.');
    }
    await page.waitForTimeout(2000);

    console.log('Abriendo sala de chat...');

    // 2. Esperar y escribir en el área de texto del chat
    const textbox = page.locator('div[role="textbox"], [contenteditable="true"]').first();
    await textbox.waitFor({ state: 'visible', timeout: 10000 });
    
    // 3. Escribir y enviar
    await textbox.fill(message);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');

    console.log(`✅ MENSAJE ENVIADO A @${username}`);
    await page.waitForTimeout(3000);
  } catch (error) {
    console.error(`❌ FALLO AL ENVIAR A @${username}:`, error.message);
    // Tomar captura para debug si falla
    await page.screenshot({ path: `error-ig-${username}.png` });
  } finally {
    await context.storageState({ path: STORAGE_STATE });
    await browser.close();
  }
}

const userArg = args.find(a => a.startsWith('--username='))?.split('=')[1] 
             || args.find(a => a.startsWith('--user='))?.split('=')[1];
const msgArg = args.find(a => a.startsWith('--message='))?.split('=')[1]
            || args.find(a => a.startsWith('--text='))?.split('=')[1];

if (userArg && msgArg) {
  sendDM(userArg, msgArg);
} else {
  console.log('Uso: node ig-dm.mjs --username=USUARIO --message="TU MENSAJE" [--sender=SENDER]');
  console.log('     node ig-dm.mjs --user=USUARIO --text="TU MENSAJE" [--sender=SENDER]');
}
