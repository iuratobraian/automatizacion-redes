/**
 * ig-publisher-debug.mjs
 * Modo asistido: el script abre Instagram y tú navegás libremente.
 * Cuando clickeás "Publicación" (que abre el filechooser), el script 
 * intercepta automáticamente el selector de archivos e inyecta la imagen.
 * Después escribe la caption y espera que hagas click en "Compartir".
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const sessionPath  = path.join(PROJECT_ROOT, '.agent', 'instagram_auth_braiurato.json');
const imagePath    = path.join(PROJECT_ROOT, 'scripts', 'marketing', 'tradeshare_promo_bot.png');
const clickLogPath = path.join(PROJECT_ROOT, '.agent', 'click_log.json');
const SHOT_DIR     = path.join(PROJECT_ROOT, 'public', 'generated_posts');

const clicks = [];
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(SHOT_DIR, `dbg_${name}.png`) }).catch(() => {});
  console.log(`📸 ${name}`);
};

const IPHONE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 430, height: 932 },
  screen:   { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

const caption = `🤖 ¿Listo para eliminar las emociones de tu operativa y operar como los profesionales? 🚀

En TradeShare diseñamos el BOT de Autotrading Institucional definitivo para resguardar tu capital y maximizar tus ganancias.

✅ Trailing Stop Inteligente por estructura
✅ Gestión dinámica de zonas clave
✅ Breakeven automático y confirmaciones en vivo

💬 Comenta la palabra BOT abajo y te enviamos todos los detalles por privado de forma inmediata. ¡Nos vemos adentro! 👇

#tradeshare #autotrading #tradingalgoritmico #forex #trading`;

async function run() {
  console.log('🚀 Modo ASISTIDO — Navegás vos, el script hace el resto');
  console.log('─'.repeat(58));
  console.log('📋 INSTRUCCIONES:');
  console.log('   1. Hacé click en el botón "+" (arriba a la derecha)');
  console.log('   2. Seleccioná "Publicación" — la imagen se carga automáticamente');
  console.log('   3. Hacé click en "Siguiente", "Siguiente"');
  console.log('   4. La caption se escribe automáticamente');
  console.log('   5. Hacé click en "Compartir"');
  console.log('─'.repeat(58));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const context = await browser.newContext({
    ...IPHONE,
    storageState: sessionPath,
    locale: 'es-AR',
  });
  const page = await context.newPage();

  // ── Registrar clicks del usuario ──
  await page.exposeFunction('logClick', (x, y, tag, text) => {
    const e = { x: Math.round(x), y: Math.round(y), tag, text: (text || '').slice(0, 80).trim() };
    clicks.push(e);
    console.log(`🖱️  (${e.x},${e.y}) <${e.tag}> "${e.text}"`);
    fs.writeFileSync(clickLogPath, JSON.stringify(clicks, null, 2));
  });
  await context.addInitScript(() => {
    document.addEventListener('click', (e) => {
      window.logClick(e.clientX, e.clientY, e.target.tagName.toLowerCase(), e.target.innerText || e.target.textContent || '');
    }, true);
  });

  // ── Interceptar filechooser en cualquier momento ──
  // Esto captura el selector de archivo cuando el usuario hace click en "Publicación"
  let imageInjected = false;
  context.on('page', (p) => {
    p.on('filechooser', async (chooser) => {
      if (!imageInjected) {
        await chooser.setFiles(imagePath);
        imageInjected = true;
        console.log('\n✅ IMAGEN INYECTADA AUTOMÁTICAMENTE en el filechooser.');
        console.log('   Ahora hacé click en "Siguiente" hasta llegar a la caption.\n');
      }
    });
  });
  page.on('filechooser', async (chooser) => {
    if (!imageInjected) {
      await chooser.setFiles(imagePath);
      imageInjected = true;
      console.log('\n✅ IMAGEN INYECTADA AUTOMÁTICAMENTE en el filechooser.');
      console.log('   Ahora hacé click en "Siguiente" hasta llegar a la caption.\n');
    }
  });

  // ── Navegar ──
  console.log('\n[1] Abriendo Instagram...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Cerrar popups iniciales
  for (const t of ['Ahora no', 'Not Now', 'Cancelar']) {
    const b = page.locator(`button:has-text("${t}")`).first();
    if (await b.count() > 0) { await b.click().catch(() => {}); await page.waitForTimeout(500); }
  }

  await shot(page, '01_home');
  console.log('\n🟡 Listo. Hacé click en "+" para empezar.\n');

  // ── Esperar que la imagen sea inyectada (máx 5 min) ──
  const waitStart = Date.now();
  while (!imageInjected && Date.now() - waitStart < 300_000) {
    await page.waitForTimeout(1000);
    
    // Cuando ya se inyectó la imagen, automatizar caption
    if (imageInjected) break;
  }

  if (!imageInjected) {
    console.log('⏱️ Tiempo agotado esperando la selección de imagen.');
    await browser.close();
    return;
  }

  // ── Esperar que naveguen a la pantalla de caption (los "Siguiente" los hace el usuario) ──
  // Detectar cuando aparece textarea (pantalla de caption)
  console.log('⏳ Esperando que llegues a la pantalla de caption (hacé click en Siguiente)...');
  try {
    await page.waitForSelector('textarea, div[role="textbox"], div[contenteditable="true"]', { timeout: 120_000 });
    console.log('✅ Pantalla de caption detectada. Escribiendo...');
  } catch {
    console.log('⚠️ No detecté la pantalla de caption automáticamente, intentando escribir igual...');
  }

  await page.waitForTimeout(1000);
  await shot(page, '05_caption_screen');

  // ── Escribir caption ──
  let captionWritten = false;
  for (const sel of ['textarea[aria-label*="pie"]', 'textarea', 'div[role="textbox"]', 'div[contenteditable="true"]']) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      await el.click();
      await page.waitForTimeout(400);
      await el.fill(caption);
      captionWritten = true;
      console.log('✅ Caption escrita automáticamente.');
      break;
    }
  }
  if (!captionWritten) {
    console.log('⚠️ No pude escribir la caption automáticamente. Escribila vos manualmente.');
  }

  await page.waitForTimeout(1000);
  await shot(page, '06_before_share');

  console.log('\n' + '═'.repeat(58));
  console.log('🟢 ÚLTIMO PASO — Hacé click en "Compartir" (arriba a la derecha).');
  console.log('   Las coordenadas exactas quedan registradas.');
  console.log('═'.repeat(58) + '\n');

  // ── Esperar publicación exitosa ──
  try {
    await page.waitForURL(/instagram\.com\/(p|reel)\//, { timeout: 300_000 });
    console.log('\n✅ ¡PUBLICADO EXITOSAMENTE!');
    console.log('🔗 URL:', page.url());
  } catch {
    try {
      await page.goto('https://www.instagram.com/braiurato/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const href = await page.locator('a[href*="/p/"]').first().getAttribute('href').catch(() => null);
      if (href) console.log('🔗 Post reciente:', `https://www.instagram.com${href}`);
    } catch {}
  }

  console.log('\n📋 TUS CLICKS (para calibrar el script automático):');
  clicks.forEach((c, i) => console.log(`  ${i + 1}. (${c.x},${c.y}) <${c.tag}> "${c.text.slice(0,50)}"`));
  console.log(`\n💾 Guardados en: ${clickLogPath}`);

  await page.waitForTimeout(30000);
  await browser.close();
}

run().catch(console.error);
