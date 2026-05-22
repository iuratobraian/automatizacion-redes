import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const STORAGE_STATE = path.join(process.cwd(), '.agent', 'gemini_auth.json');

async function auth() {
  console.log('🚀 Iniciando navegador para Login de Gemini...');
  if (!fs.existsSync(path.dirname(STORAGE_STATE))) {
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false,
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
  
  await page.goto('https://gemini.google.com/app?hl=es');
  
  console.log('--------------------------------------------------');
  console.log('👉 POR FAVOR, INICIA SESIÓN EN TU CUENTA DE GOOGLE/GEMINI MANUALMENTE.');
  console.log('👉 CIERRA EL NAVEGADOR CUANDO ESTÉS EN LA PANTALLA PRINCIPAL DE GEMINI.');
  console.log('--------------------------------------------------');

  console.log('Esperando a que el login en Gemini sea exitoso...');
  try {
    await new Promise((resolve) => {
      page.on('close', resolve);
    });
    
    console.log('💾 Detectado cierre manual del navegador. Guardando estado de sesión...');
    await context.storageState({ path: STORAGE_STATE });
    console.log(`✅ SESIÓN GUARDADA EXITOSAMENTE en .agent/gemini_auth.json`);
  } catch (e) {
    console.error('❌ Error al guardar la sesión:', e.message);
  } finally {
    await browser.close();
  }
}

auth();
