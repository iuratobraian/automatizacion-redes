import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const args = process.argv.slice(2);
const senderArg = args.find(a => a.startsWith('--sender='))?.split('=')[1];
const filename = senderArg ? `instagram_auth_${senderArg}.json` : 'instagram_auth.json';
const STORAGE_STATE = path.join(process.cwd(), '.agent', filename);

const IPHONE_DEVICE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 430, height: 932 },
  screen: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
};

async function authFlow() {
  console.log(`🚀 Iniciando flujo de autenticación profesional para: ${senderArg ? '@' + senderArg : 'por defecto'}`);
  
  if (!fs.existsSync(path.dirname(STORAGE_STATE))) {
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const context = await browser.newContext({
    ...IPHONE_DEVICE,
    locale: 'es-AR',
    permissions: ['geolocation']
  });
  
  const page = await context.newPage();
  
  console.log('🌐 Navegando a la página de login de Instagram...');
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
  
  console.log('--------------------------------------------------');
  console.log(`👉 POR FAVOR, LOGUÉATE CON LA CUENTA ${senderArg ? '@' + senderArg : 'de Instagram'} MANUALMENTE EN LA VENTANA DE NAVEGADOR.`);
  console.log('👉 EL SISTEMA DETECTARÁ EL INGRESO EXITOSO Y GUARDARÁ LA SESIÓN.');
  console.log('--------------------------------------------------');
  
  try {
    // Esperar a que el usuario esté dentro del Feed
    await page.waitForSelector('svg[aria-label="Inicio"], svg[aria-label="Home"], a[href="/direct/inbox/"]', { timeout: 300000 }); // 5 min
    console.log('🎉 ¡Login detectado con éxito! Estabilizando sesión (5s)...');
    await page.waitForTimeout(5000);

    // Intentar cerrar el popup de "Guardar información de inicio de sesión" si aparece
    const saveInfoBtn = page.locator('button:has-text("Ahora no"), button:has-text("Not Now"), button:has-text("Guardar información")').first();
    if (await saveInfoBtn.count() > 0) {
      await saveInfoBtn.click().catch(() => {});
      console.log('🔇 Popup de guardar información cerrado/omitido.');
      await page.waitForTimeout(2000);
    }

    // Guardar el estado de la sesión
    await context.storageState({ path: STORAGE_STATE });
    console.log(`✅ SESIÓN PERSISTENTE GUARDADA EXITOSAMENTE en: .agent/${filename}`);
    
    // Crear copia de backup
    const backupFilename = senderArg ? `instagram_auth_${senderArg}_backup.json` : 'instagram_auth_backup.json';
    const backupPath = path.join(process.cwd(), '.agent', backupFilename);
    fs.copyFileSync(STORAGE_STATE, backupPath);
    console.log(`🛡️ Backup de sesión creado en: .agent/${backupFilename}`);
    
  } catch (e) {
    console.error('❌ El proceso de login expiró o falló:', e.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

authFlow();
