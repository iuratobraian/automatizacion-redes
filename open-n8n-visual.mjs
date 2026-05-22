import { chromium } from 'playwright';
import path from 'path';

async function openN8N() {
  console.log('🌐 Abriendo n8n en modo visual para aprendizaje supervisado...');
  console.log('💡 Prepárate para guiarme con los clics exactos.');

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] 
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Intentar conectar a n8n local
    await page.goto('http://localhost:5678', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('✅ Conectado a n8n. El navegador permanecerá abierto.');
    
    // Mantener abierto para que el usuario interactúe
    await page.waitForTimeout(600000); // 10 minutos
  } catch (error) {
    console.error('❌ Error al abrir n8n:', error.message);
    console.log('💡 ¿Está n8n corriendo en el puerto 5678? Si no, dime la URL correcta.');
  } finally {
    // await browser.close();
  }
}

openN8N();
