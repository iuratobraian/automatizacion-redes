import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'manus_auth.json');

async function authManus() {
  console.log('🚀 Iniciando navegador para Login de Manus.im...');
  if (!fs.existsSync(path.dirname(STORAGE_STATE))) {
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false, // Debe ser headful para iniciar sesión manualmente
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--start-maximized'
    ]
  });
  
  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  await page.goto('https://manus.im/');
  
  console.log('--------------------------------------------------');
  console.log('👉 POR FAVOR, INICIA SESIÓN EN TU CUENTA DE MANUS MANUALMENTE.');
  console.log('👉 CIERRA EL NAVEGADOR CUANDO ESTÉS DENTRO DEL PANEL DE TRABAJO/CHATS.');
  console.log('--------------------------------------------------');

  console.log('Esperando a que el login en Manus sea exitoso...');
  try {
    // Esperar a que la página se cierre manualmente por el usuario
    await new Promise((resolve) => {
      page.on('close', resolve);
    });
    
    console.log('💾 Detectado cierre manual del navegador. Guardando estado de sesión...');
    await context.storageState({ path: STORAGE_STATE });
    console.log(`✅ SESIÓN GUARDADA EXITOSAMENTE en .agent/manus_auth.json`);
  } catch (e) {
    console.error('❌ Error al guardar la sesión:', e.message);
  } finally {
    await browser.close();
  }
}

authManus();
