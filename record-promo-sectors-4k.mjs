/**
 * record-promo-sectors-4k.mjs — TradeShare Auto-Recording 4K Promotional Engine
 * Genera videos promocionales individuales de todos los sectores de TradeShare
 * en resolución cinematográfica 4K UHD (3840x2160) de forma 100% automatizada.
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VIDEO_DIR = path.join(ROOT, "public", "generated_posts", "videos");

if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

const PAGES = [
  { name: "home", url: "http://localhost:3000/", selectorToClick: null },
  { name: "marketplace", url: "http://localhost:3000/marketplace", selectorToClick: "button:has-text('Filtros'), .filter-button, a[href*='marketplace']" },
  { name: "comunidad", url: "http://localhost:3000/comunidad", selectorToClick: "button:has-text('Explorar'), a[href*='comunidad']" },
  { name: "precios", url: "http://localhost:3000/precios", selectorToClick: null },
  { name: "bitacora", url: "http://localhost:3000/bitacora", selectorToClick: "button:has-text('Nueva Entrada'), button:has-text('Agregar')" },
  { name: "exness", url: "http://localhost:3000/exness", selectorToClick: "button:has-text('Conectar'), button:has-text('Vincular')" },
  { name: "psicotrading", url: "http://localhost:3000/psicotrading", selectorToClick: "button:has-text('Comenzar'), button:has-text('Iniciar Test')" }
];

async function recordPromo4K() {
  console.log("🎥 === INICIANDO GRABACIÓN AUTOMÁTICA EN RESOLUCIÓN 4K UHD (3840x2160) ===");
  console.log(`📂 Destino: ${VIDEO_DIR}\n`);

  for (const pageInfo of PAGES) {
    console.log(`\n📹 [SECTOR: ${pageInfo.name.toUpperCase()}]`);
    console.log(`🔌 Creando contexto 4K para: ${pageInfo.url}...`);

    // Iniciar browser con no-sandbox y habilitar GPU si existiera para render ultra-suave de 4K
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"]
    });

    // Crear un directorio temporal para esta grabación específica
    const tempDir = path.join(VIDEO_DIR, `temp_${pageInfo.name}`);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: 3840, height: 2160 },
      recordVideo: {
        dir: tempDir,
        size: { width: 3840, height: 2160 }
      },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });

    const page = await context.newPage();

    try {
      // 1. Navegar y esperar carga completa
      await page.goto(pageInfo.url, { waitUntil: "load", timeout: 45000 });
      console.log("⏳ Esperando que desaparezcan cargadores y skeletons de datos...");
      
      // Dar tiempo inicial para que Convex y el backend resuelvan
      await page.waitForTimeout(12000);

      // Esperar activamente si hay selectores comunes de carga en el DOM
      try {
        await page.waitForFunction(() => {
          const loadingEl = document.querySelector('.loader, .spinner, [class*="loading"], [id*="loading"], .skeleton, [class*="skeleton"]');
          return !loadingEl || loadingEl.getBoundingClientRect().height === 0;
        }, { timeout: 8000 });
      } catch (e) {
        console.log("ℹ️ No se detectó spinner persistente o ya terminó de cargar.");
      }

      // 2. Limpiar elementos flotantes que bloquean la hermosa visualización
      await page.evaluate(() => {
        const banners = document.querySelectorAll("[class*='cookie'], [id*='cookie'], [class*='popup'], [class*='modal']");
        banners.forEach(el => el.remove());
      }).catch(() => {});

      // 3. Simular clics e interacciones con botones/filtros/secciones para dar dinamismo
      if (pageInfo.selectorToClick) {
        console.log(`🖱️ Interactuando con elementos interactivos (${pageInfo.selectorToClick})...`);
        try {
          const btn = page.locator(pageInfo.selectorToClick).first();
          if (await btn.isVisible()) {
            await btn.hover();
            await page.waitForTimeout(1000);
            await btn.click();
            await page.waitForTimeout(2000);
          }
        } catch (clickErr) {
          console.log(`ℹ️ No se interactuó con selector: ${clickErr.message}`);
        }
      }

      // 4. Realizar desplazamiento suave hacia abajo
      console.log("⏬ Realizando scroll cinematográfico fluido en 4K...");
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 12; // Desplazamiento progresivo
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            // Recorrer hasta 2800px para capturar toda la landing
            if (totalHeight >= scrollHeight || totalHeight > 2800) {
              clearInterval(timer);
              resolve();
            }
          }, 12);
        });
      });

      await page.waitForTimeout(2500); // Pausa visual abajo

      // 5. Retornar con suavidad al tope de la página
      console.log("⏫ Volviendo suavemente al tope...");
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      await page.waitForTimeout(4000); // Esperar retorno

    } catch (err) {
      console.error(`❌ Error grabando sector ${pageInfo.name}:`, err.message);
    } finally {
      // 6. Cerrar el contexto para guardar el video en el disco
      await page.close();
      await context.close();
      await browser.close();

      // Mover el video WebM consolidado a la raíz de videos
      try {
        const files = fs.readdirSync(tempDir);
        const webmFile = files.find(f => f.endsWith(".webm"));
        if (webmFile) {
          const oldPath = path.join(tempDir, webmFile);
          const newPath = path.join(VIDEO_DIR, `tradeshare_4k_${pageInfo.name}.webm`);
          fs.renameSync(oldPath, newPath);
          console.log(`✅ ¡Video 4K guardado!: tradeshare_4k_${pageInfo.name}.webm`);
        }
        // Limpiar directorio temporal
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (moveErr) {
        console.error("⚠️ Falló renombrado de video:", moveErr.message);
      }
    }
  }

  console.log("\n✨ === ¡TODOS LOS VIDEOS 4K GENERADOS CON EXITO! ===");
  process.exit(0);
}

recordPromo4K();
