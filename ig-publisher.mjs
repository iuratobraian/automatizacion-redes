import { chromium, devices } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const CONFIG_PATH = path.join(process.cwd(), '.agent', 'ig-config.json');

// Leer argumentos
const args = {};
process.argv.slice(2).forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    args[key.replace('--', '')] = value;
  }
});

const type = args.type || 'feed';
const imagePath = args.image;
const caption = args.caption || '¡Mentalidad de Trading! 🚀 #tradeshare #trading #forex';

if (!imagePath || !fs.existsSync(path.resolve(imagePath))) {
  console.error('❌ Error: Falta --image o el archivo no existe.');
  process.exit(1);
}

const resolvedImagePath = path.resolve(imagePath);

const IPHONE_DEVICE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 430, height: 932 },
  screen: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
};

let selectedAccount = 'braiurato';
let activeSessionPath = '';

async function runPublisher() {
  console.log(`🚀 Publicador Instagram (iPhone 14 Pro Max) - Tipo: ${type.toUpperCase()}`);

  let config = { headless: false };
  if (fs.existsSync(CONFIG_PATH)) {
    try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) {}
  }

  selectedAccount = args.account || config.selectedAccount || process.env.IG_ACCOUNT || 'braiurato';
  const sessionPath = path.join(process.cwd(), '.agent', `instagram_auth_${selectedAccount}.json`);
  const fallbackSessionPath = path.join(process.cwd(), '.agent', 'instagram_auth.json');
  activeSessionPath = fs.existsSync(sessionPath) ? sessionPath : fallbackSessionPath;

  if (!fs.existsSync(activeSessionPath)) {
    console.error(`❌ No hay sesión para @${selectedAccount}.`);
    process.exit(1);
  }

  console.log(`🔑 Cuenta: @${selectedAccount} | Sesión: ${activeSessionPath}`);

  if (type === 'story') {
    await publishStory(activeSessionPath, config.headless);
  } else {
    await publishFeed(activeSessionPath, config.headless);
  }
}

async function createMobileBrowser(sessionPath, headless) {
  const browser = await chromium.launch({
    headless: headless === true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  const context = await browser.newContext({
    ...IPHONE_DEVICE,
    storageState: sessionPath,
    locale: 'es-AR',
    permissions: ['geolocation']
  });
  const page = await context.newPage();
  return { browser, context, page };
}

// Cerrar TODOS los popups persistentes de Instagram y guardar el estado
async function dismissAllPopups(page, context) {
  await page.waitForTimeout(2000);

  // Lista completa de botones de popups conocidos
  const popupTexts = [
    'Activar',           // "La pestaña de mensajes tiene un nuevo diseño"
    'Aceptar',           // Variante del anterior
    'Ahora no',          // "Guardar información de inicio de sesión"
    'Not Now',           // Inglés
    'Guardar información', // Guardar sesión
    'Guardar',           // Variante
    'Cancelar',          // Cerrar diálogos
  ];

  for (const text of popupTexts) {
    try {
      const btn = page.locator(`button:has-text("${text}"), div[role="button"]:has-text("${text}")`);
      if (await btn.count() > 0) {
        await btn.first().click();
        await page.waitForTimeout(1200);
        console.log(`🔇 Popup "${text}" cerrado.`);
      }
    } catch (e) {}
  }

  // Cerrar banner "Usar app" (X)
  try {
    const xBtn = page.locator('svg[aria-label="Cerrar"], svg[aria-label="Close"]');
    if (await xBtn.count() > 0) {
      await xBtn.first().click();
      await page.waitForTimeout(800);
      console.log('🔇 Banner "Usar app" cerrado.');
    }
  } catch (e) {}

  // Guardar storageState actualizado para que los popups no vuelvan a aparecer
  try {
    await context.storageState({ path: activeSessionPath });
    console.log('💾 Estado de sesión actualizado (popups no volverán).');
  } catch (e) {
    console.warn('⚠️ No se pudo guardar storageState:', e.message);
  }
}

async function debugScreenshot(page, name) {
  const filePath = path.join(process.cwd(), 'public', 'generated_posts', `debug_${name}.png`);
  await page.screenshot({ path: filePath }).catch(() => {});
  console.log(`📸 [Debug] ${name}`);
}

// ═══════════════════════════════════════════════════════════════
// 📌 PUBLICAR EN EL FEED
// ═══════════════════════════════════════════════════════════════
async function publishFeed(sessionPath, headless) {
  console.log('📱 Feed: Iniciando (iPhone 14 Pro Max)...');
  const { browser, context, page } = await createMobileBrowser(sessionPath, headless);

  try {
    console.log('🤖 Navegando a Instagram móvil...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    await dismissAllPopups(page, context);

    // PASO 1: Clic en "+"
    console.log('➕ Clic en "+"...');
    const plusBtn = page.locator('svg[aria-label="Nueva publicación"]').first();
    if (await plusBtn.count() > 0) {
      await plusBtn.click();
    } else {
      const headerLink = page.locator('header a:has(svg)').first();
      if (await headerLink.count() > 0) await headerLink.click();
      else await page.touchscreen.tap(400, 27);
    }
    await page.waitForTimeout(2000);

    // PASO 2: Clic en "Publicación"
    console.log('📋 Seleccionando "Publicación"...');
    const pubBtn = page.locator('text="Publicación"').first();
    if (await pubBtn.count() > 0) {
      await pubBtn.click();
      console.log('  ✅ "Publicación" seleccionada.');
    }
    await page.waitForTimeout(3000);

    // PASO 3: Subir imagen (usar el ÚLTIMO input file)
    console.log('📥 Subiendo imagen...');
    await page.locator('input[type="file"]').last().setInputFiles(resolvedImagePath);
    console.log('  ✅ Imagen cargada.');
    await page.waitForTimeout(5000);
    await debugScreenshot(page, 'feed_03_image');

    // PASO 4: Relación de aspecto (intentar seleccionar Original)
    console.log('🔲 Buscando aspecto...');
    for (const sel of [
      'svg[aria-label="Seleccionar recorte"]',
      'svg[aria-label="Select crop"]',
      'button:has(svg[aria-label*="recort"])'
    ]) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          await page.waitForTimeout(1500);
          const origBtn = page.locator('svg[aria-label*="original"], button:has-text("Original")').first();
          if (await origBtn.count() > 0) {
            await origBtn.click();
            console.log('  ✅ Aspecto: Original');
          }
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {}
    }

    // PASO 5: Botón "Siguiente" (recorte → filtros → caption)
    console.log('➡️ Avanzando...');
    for (let step = 1; step <= 3; step++) {
      await page.waitForTimeout(1500);
      const nextBtn = page.locator('div[role="button"]:has-text("Siguiente"), button:has-text("Siguiente")').first();
      if (await nextBtn.count() > 0) {
        await nextBtn.click();
        console.log(`  ✅ Siguiente (${step})`);
        await page.waitForTimeout(2500);
      } else {
        break;
      }
    }
    await debugScreenshot(page, 'feed_05_caption');

    // PASO 6: Escribir caption
    console.log('📝 Escribiendo caption...');
    for (const sel of ['textarea', 'div[role="textbox"]', 'div[contenteditable="true"]']) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          await page.waitForTimeout(300);
          await el.fill(caption);
          console.log('  ✅ Caption escrita.');
          break;
        }
      } catch (e) {}
    }
    await page.waitForTimeout(1500);
    await debugScreenshot(page, 'feed_06_before_share');

    // ═══════════════════════════════════════════════════════════
    // PASO 7: COMPARTIR — El botón "Compartir" es TEXTO AZUL
    //         en la esquina SUPERIOR DERECHA del header.
    //         Buscamos por bounding box Y < 80 para evitar "Compartir historia"
    // ═══════════════════════════════════════════════════════════
    console.log('🚀 Publicando — buscando botón "Compartir" del header...');
    let shared = false;

    // Estrategia 1: Buscar dentro del role=dialog el botón superior con texto Compartir
    const allShareCandidates = [
      page.locator('[role="dialog"] >> text=Compartir').first(),
      page.locator('header >> text=Compartir').first(),
      page.locator('div[role="button"]:has-text("Compartir")').first(),
    ];

    for (const candidate of allShareCandidates) {
      try {
        if (await candidate.count() > 0) {
          const box = await candidate.boundingBox();
          if (box) {
            console.log(`  📍 Candidato "Compartir": x=${Math.round(box.x)}, y=${Math.round(box.y)}`);
            // Solo aceptar elementos en la parte SUPERIOR del modal (y < 80px)
            if (box.y < 80) {
              await candidate.click({ force: true });
              shared = true;
              console.log('  ✅ Compartir (header) pulsado.');
              break;
            }
          }
        }
      } catch (e) {}
    }

    // Estrategia 2: Iterar TODOS los elementos con texto Compartir y elegir el más arriba
    if (!shared) {
      try {
        const allShare = page.getByText('Compartir', { exact: true });
        const count = await allShare.count();
        console.log(`  📊 Elementos "Compartir" encontrados: ${count}`);
        let topY = Infinity;
        let topIdx = -1;
        for (let i = 0; i < count; i++) {
          const box = await allShare.nth(i).boundingBox();
          if (box && box.y < topY) {
            topY = box.y;
            topIdx = i;
          }
        }
        if (topIdx >= 0 && topY < 80) {
          await allShare.nth(topIdx).click({ force: true });
          shared = true;
          console.log(`  ✅ Compartir (topmost, y=${Math.round(topY)}) pulsado.`);
        } else if (topIdx >= 0) {
          console.log(`  ⚠️ El elemento más alto está en y=${Math.round(topY)}, posiblemente no es el header.`);
          // Tomamos screenshot para debug y NO hacemos tap a ciegas
          await debugScreenshot(page, 'feed_share_debug');
        }
      } catch (e) {
        console.log('  ⚠️ Error en estrategia 2:', e.message);
      }
    }

    if (!shared) {
      console.log('  ❌ No se pudo encontrar el botón Compartir del header. Tomando screenshot para debug...');
      await debugScreenshot(page, 'feed_share_not_found');
    }

    // Esperar confirmación
    console.log('⏳ Esperando confirmación (25s)...');
    await page.waitForTimeout(25000);
    await debugScreenshot(page, 'feed_07_done');

    // Guardar storageState final
    try {
      await context.storageState({ path: activeSessionPath });
      console.log('💾 Sesión guardada.');
    } catch (e) {}

    // PASO 8: Obtener URL del post y registrarla para monitoreo automático
    console.log('🔗 Buscando enlace del post publicado...');
    try {
      await page.goto(`https://www.instagram.com/${selectedAccount}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const firstPost = page.locator('a[href*="/p/"]').first();
      if (await firstPost.count() > 0) {
        const href = await firstPost.getAttribute('href');
        const postUrl = `https://www.instagram.com${href}`;
        console.log(`🎯 Enlace del post: ${postUrl}`);
        updateVault({ instagramFeedUrl: postUrl });

        // ★ AUTO-REGISTRAR en .agent/monitored_posts.json para que el daemon lo vigile automáticamente
        const monitoredPath = path.join(process.cwd(), '.agent', 'monitored_posts.json');
        let monitoredData = { posts: [], profiles: ['tradeshare.ok', 'braiurato'] };
        try {
          const raw = fs.readFileSync(monitoredPath, 'utf-8');
          monitoredData = JSON.parse(raw);
          if (!Array.isArray(monitoredData.posts)) monitoredData.posts = [];
          if (!Array.isArray(monitoredData.profiles)) monitoredData.profiles = ['tradeshare.ok', 'braiurato'];
        } catch {}
        const normalized = postUrl.replace(/\/+$/, '') + '/';
        if (!monitoredData.posts.some(p => p.replace(/\/+$/, '/') === normalized)) {
          monitoredData.posts.push(normalized);
          fs.writeFileSync(monitoredPath, JSON.stringify(monitoredData, null, 2));
          console.log(`📌 Post registrado automáticamente para monitoreo: ${normalized}`);
        }
      }
    } catch (e) {
      console.warn('⚠️ No se pudo extraer enlace:', e.message);
    }


    console.log('🎉 ¡Feed completado!');
  } catch (err) {
    console.error('❌ Error Feed:', err.message);
    await debugScreenshot(page, 'feed_error');
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════════════════════════
// 📌 PUBLICAR EN HISTORIAS
// ═══════════════════════════════════════════════════════════════
async function publishStory(sessionPath, headless) {
  console.log('📱 Historia: Iniciando (iPhone 14 Pro Max)...');
  const { browser, context, page } = await createMobileBrowser(sessionPath, headless);

  try {
    console.log('🤖 Navegando a Instagram móvil...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    await dismissAllPopups(page, context);

    // PASO 1: Clic en "Tu historia"
    console.log('📸 Clic en "Tu historia"...');
    const storyBubble = page.locator('span:has-text("Tu historia")').first();
    if (await storyBubble.count() > 0) {
      await storyBubble.click();
      console.log('  ✅ "Tu historia" encontrado.');
    } else {
      console.log('  ⚠️ Tocando primera burbuja...');
      await page.touchscreen.tap(100, 130);
    }
    await page.waitForTimeout(3000);

    // PASO 2: Subir imagen
    console.log('📥 Subiendo imagen...');
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(resolvedImagePath);
      console.log('  ✅ Imagen cargada.');
    } else {
      throw new Error('No se encontró input de archivo.');
    }
    await page.waitForTimeout(8000);
    await debugScreenshot(page, 'story_02_preview');

    // PASO 3: "Compartir historia" — puede ser botón o texto
    console.log('🚀 Publicando historia...');
    let shared = false;
    
    // Intentar selectores
    for (const sel of [
      'div[role="button"]:has-text("Compartir historia")',
      'button:has-text("Compartir historia")',
      'span:has-text("Compartir historia")'
    ]) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          shared = true;
          console.log(`  ✅ Compartida con: ${sel}`);
          break;
        }
      } catch (e) {}
    }

    // Fallback: getByText
    if (!shared) {
      try {
        const shareBtn = page.getByText('Compartir historia', { exact: true }).first();
        if (await shareBtn.count() > 0) {
          await shareBtn.click();
          shared = true;
          console.log('  ✅ Compartida via getByText.');
        }
      } catch (e) {}
    }

    // Fallback final: tap en la posición del botón (centro inferior)
    if (!shared) {
      console.log('  🎯 Toque en coordenada (215, 900)...');
      await page.touchscreen.tap(215, 900);
    }

    console.log('⏳ Esperando (15s)...');
    await page.waitForTimeout(15000);
    await debugScreenshot(page, 'story_03_done');

    // Guardar storageState
    try {
      await context.storageState({ path: activeSessionPath });
    } catch (e) {}

    console.log('🎉 ¡Historia publicada!');
    updateVault({ instagramStoryPosted: true });
  } catch (err) {
    console.error('❌ Error Historia:', err.message);
    await debugScreenshot(page, 'story_error');
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
function localStorageGet(key) {
  try {
    const filePath = path.join(process.cwd(), '.agent', 'local_storage_cache.json');
    if (fs.existsSync(filePath)) {
      const db = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return db[key];
    }
  } catch (e) {}
  return null;
}

function updateVault(data) {
  try {
    const vaultPath = path.join(process.cwd(), '.agent', 'marketing_vault.json');
    if (fs.existsSync(vaultPath)) {
      const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      if (vault.length > 0) {
        vault[vault.length - 1] = { ...vault[vault.length - 1], ...data };
        fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
        console.log('💾 Bóveda actualizada:', data);
      }
    }
  } catch (e) {
    console.error('⚠️ Error bóveda:', e.message);
  }
}

runPublisher();
