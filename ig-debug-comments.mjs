// ig-debug-comments.mjs
// Correr con: node ig-debug-comments.mjs --post="https://www.instagram.com/p/SHORTCODE/"
// Genera screenshots y un dump del DOM para que puedas ver exactamente qué ve Playwright.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const postArg = args.find(a => a.startsWith('--post='))?.split('=')[1];
const accountArg = args.find(a => a.startsWith('--account='))?.split('=')[1] || 'tradeshare.ok';

if (!postArg) {
  console.log('Uso: node ig-debug-comments.mjs --post="https://www.instagram.com/p/SHORTCODE/" [--account=tradeshare.ok]');
  process.exit(1);
}

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const STORAGE_STATE = path.join(PROJECT_ROOT, '.agent', `instagram_auth_${accountArg}.json`);
const DEBUG_DIR = path.join(PROJECT_ROOT, '.agent', 'debug');
fs.mkdirSync(DEBUG_DIR, { recursive: true });

const DEVICE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

async function shot(page, name) {
  const p = path.join(DEBUG_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`📸 Screenshot: ${p}`);
}

async function dumpVisibleText(page, label) {
  const texts = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text.length > 1) results.push(text);
    }
    return [...new Set(results)]; // deduplicar
  });
  console.log(`\n📝 Textos visibles en "${label}":`);
  texts.forEach(t => console.log(`  "${t}"`));
  fs.writeFileSync(path.join(DEBUG_DIR, `${label}-texts.json`), JSON.stringify(texts, null, 2));
}

async function dumpLinks(page, label) {
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ href: a.getAttribute('href'), text: a.innerText?.trim() }))
      .filter(l => l.href)
  );
  console.log(`\n🔗 Links encontrados en "${label}":`);
  links.forEach(l => console.log(`  ${l.href}  →  "${l.text}"`));
  fs.writeFileSync(path.join(DEBUG_DIR, `${label}-links.json`), JSON.stringify(links, null, 2));
}

async function dumpSpans(page, label) {
  const spans = await page.evaluate(() =>
    Array.from(document.querySelectorAll('span'))
      .map(s => ({
        text: s.textContent?.trim(),
        dir: s.getAttribute('dir'),
        role: s.getAttribute('role'),
        class: s.className?.substring(0, 60)
      }))
      .filter(s => s.text && s.text.length > 0)
  );
  console.log(`\n🔠 Spans encontrados en "${label}":`);
  spans.forEach(s => console.log(`  dir="${s.dir}" role="${s.role}" → "${s.text}"`));
  fs.writeFileSync(path.join(DEBUG_DIR, `${label}-spans.json`), JSON.stringify(spans, null, 2));
}

async function main() {
  console.log(`\n🔍 Iniciando diagnóstico para: ${postArg}`);
  console.log(`📂 Los archivos se guardan en: ${DEBUG_DIR}\n`);

  const browser = await chromium.launch({ headless: true }); // headless por defecto para el agente, el usuario puede cambiarlo
  const context = await browser.newContext({
    ...DEVICE,
    storageState: STORAGE_STATE,
    locale: 'es-AR',
  });
  const page = await context.newPage();

  // ── PASO 1: Ir al post base ──
  console.log('➡️  Navegando al post...');
  await page.goto(postArg, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot(page, '01-post-inicial');
  await dumpVisibleText(page, '01-post-inicial');

  // ── PASO 2: Scroll para cargar comentarios ──
  console.log('\n➡️  Haciendo scroll...');
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(2000);
  await shot(page, '02-post-scroll');
  await dumpVisibleText(page, '02-post-scroll');

  // ── PASO 3: Buscar y reportar botón "Ver comentarios" ──
  console.log('\n➡️  Buscando botón "Ver X comentarios"...');
  const botonTextos = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && /ver.*comentario/i.test(el.textContent))
      .map(el => ({
        tag: el.tagName,
        text: el.textContent.trim(),
        role: el.getAttribute('role'),
        class: el.className?.substring(0, 80)
      }));
  });
  console.log('Botones "Ver comentarios" encontrados:', JSON.stringify(botonTextos, null, 2));

  // ── PASO 4: Intentar click en "Ver X comentarios" ──
  if (botonTextos.length > 0) {
    try {
      const btn = page.locator('span, div, a').filter({ hasText: /ver.*comentario/i }).first();
      await btn.click({ timeout: 4000 });
      console.log('✅ Click en "Ver comentarios" realizado');
      await page.waitForTimeout(2500);
    } catch (e) {
      console.log('❌ No se pudo hacer click:', e.message);
    }
  }

  // ── PASO 5: Screenshot y dump de la página de comentarios ──
  await shot(page, '03-comentarios-abiertos');
  await dumpVisibleText(page, '03-comentarios-abiertos');
  await dumpLinks(page, '03-comentarios-abiertos');
  await dumpSpans(page, '03-comentarios-abiertos');

  // ── PASO 6: Buscar específicamente el botón "Responder" ──
  console.log('\n➡️  Buscando todos los "Responder"...');
  const responderEls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && el.textContent.trim() === 'Responder')
      .map(el => {
        // Capturar el contexto: texto de los 3 niveles de padre
        let context = '';
        let node = el.parentElement;
        for (let i = 0; i < 3; i++) {
          if (!node) break;
          context += `[${node.tagName}.${node.className?.substring(0,30)}] `;
          node = node.parentElement;
        }
        return {
          tag: el.tagName,
          role: el.getAttribute('role'),
          parentContext: context,
          // El texto del bloque padre completo (para ver a quién pertenece)
          blockText: el.closest('li, article, [role="listitem"]')?.innerText?.substring(0, 100) || ''
        };
      });
  });
  console.log('\n"Responder" elementos encontrados:');
  console.log(JSON.stringify(responderEls, null, 2));
  fs.writeFileSync(path.join(DEBUG_DIR, 'responder-elements.json'), JSON.stringify(responderEls, null, 2));

  // ── PASO 7: Guardar el HTML completo para inspección ──
  const html = await page.content();
  const htmlPath = path.join(DEBUG_DIR, 'page-full.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`\n💾 HTML completo guardado en: ${htmlPath}`);

  console.log('\n✅ Diagnóstico completo. Revisá los archivos en:', DEBUG_DIR);
  console.log('   Los screenshots muestran lo que ve Playwright.');
  console.log('   Los .json tienen los selectores exactos del DOM real.\n');

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
