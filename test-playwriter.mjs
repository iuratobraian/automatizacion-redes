import { chromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';

async function testPlaywriter() {
  console.log('🚀 Conectando a Playwriter (asegúrate de que "npx playwriter" esté corriendo)...');
  
  try {
    // 19988 es el puerto por defecto de playwriter relay
    const cdpUrl = getCdpUrl({ port: 19988, host: '127.0.0.1' });
    console.log(`🔗 Usando CDP URL: ${cdpUrl}`);

    const browser = await chromium.connectOverCDP(cdpUrl);
    console.log('✅ ¡Navegador conectado!');

    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    
    // Intentar obtener la página actual de tu Chrome
    const pages = context.pages();
    if (pages.length === 0) {
        console.log('⚠️ No se encontraron páginas abiertas en el contexto de Playwriter.');
        console.log('💡 Tip: Haz clic en el icono de la extensión de Playwriter en alguna pestaña de Chrome.');
    } else {
        const page = pages[0];
        console.log(`✅ Página detectada!`);
        console.log(`📍 URL: ${await page.url()}`);
        console.log(`📄 Título: ${await page.title()}`);
        
        console.log('📸 Tomando captura de pantalla de debug...');
        await page.screenshot({ path: '.agent/playwriter-test.png' });
        console.log('✨ Captura guardada en .agent/playwriter-test.png');
    }

    // Cerramos la conexión (esto no cierra tu Chrome real, solo la sesión de Playwright)
    await browser.close();
    console.log('👋 Desconectado del relay. Tu navegador sigue abierto.');
    
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    console.log('\n💡 Tip adicional: Verifica que la extensión esté activa y hayas hecho clic en su icono en la pestaña que quieras controlar.');
  }
}

testPlaywriter();
