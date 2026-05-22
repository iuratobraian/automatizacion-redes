import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'chatgpt_auth.json');

async function auth() {
  console.log('🚀 Iniciando navegador para Login de ChatGPT.com...');
  if (!fs.existsSync(path.dirname(STORAGE_STATE))) {
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false, // Debe ser headful para iniciar sesión manualmente
    args: [
      '--disable-blink-features=AutomationControlled', // Oculta el flag de automatización
      '--no-sandbox',
      '--start-maximized'
    ]
  });
  
  const context = await browser.newContext({
    viewport: null, // Deja que el navegador tome el tamaño máximo nativo
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  await page.goto('https://chatgpt.com');
  
  console.log('--------------------------------------------------');
  console.log('👉 POR FAVOR, INICIA SESIÓN EN TU CUENTA DE CHATGPT MANUALMENTE.');
  console.log('👉 CIERRA EL NAVEGADOR CUANDO ESTÉS DENTRO DE LA BANDEJA DE CHATS.');
  console.log('--------------------------------------------------');

  console.log('Esperando a que el login en ChatGPT sea exitoso...');
  try {
    // Esperar a que la página se cierre manualmente por el usuario (haciendo clic en la X del navegador)
    await new Promise((resolve) => {
      page.on('close', resolve);
    });
    
    console.log('💾 Detectado cierre manual del navegador. Guardando estado de sesión...');
    await context.storageState({ path: STORAGE_STATE });
    console.log(`✅ SESIÓN GUARDADA EXITOSAMENTE en .agent/chatgpt_auth.json`);
  } catch (e) {
    console.error('❌ Error al guardar la sesión:', e.message);
  } finally {
    await browser.close();
  }
}

auth();
