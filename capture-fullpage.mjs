/**
 * capture-fullpage.mjs — TradeShare Full-Page High-Fidelity Capture Engine
 * Conecta al Google Chrome real del usuario (vía CDP en puerto 19988) para capturar las landing pages
 * COMPLETAS de inicio a fin (fullPage: true) con la cuenta real ya conectada.
 */

import { chromium } from "@xmorse/playwright-core";
import { getCdpUrl } from "playwriter";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "public", "generated_posts");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const PAGES = [
  { name: "home_completa", url: "http://localhost:3000/" },
  { name: "marketplace_completa", url: "http://localhost:3000/marketplace" },
  { name: "comunidad_completa", url: "http://localhost:3000/comunidad" },
  { name: "pricing_completa", url: "http://localhost:3000/precios" },
  { name: "bitacora_completa", url: "http://localhost:3000/bitacora" },
  { name: "exness_completa", url: "http://localhost:3000/exness" },
  { name: "psicotrading_completa", url: "http://localhost:3000/psicotrading" }
];

async function captureFullPages() {
  console.log("🚀 === INICIANDO CAPTURA DE LANDINGS COMPLETAS EN CHROME REAL ===");
  console.log(`🔌 Conectando al navegador Chrome en puerto 19988...`);

  let browser;
  try {
    const cdpUrl = getCdpUrl({ port: 19988 });
    browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    
    // Obtener la pestaña activa actual en lugar de intentar abrir una nueva
    const pages = context.pages();
    let page = pages[0];
    if (!page || page.isClosed()) {
      page = await context.newPage();
    }

    console.log("✅ Conectado a la pestaña activa con éxito.");

    for (const pageInfo of PAGES) {
      console.log(`\n🌍 Navegando a: ${pageInfo.url}`);
      try {
        // Usar evento "load" en lugar de "networkidle" debido a WebSockets/tickers activos permanentes
        await page.goto(pageInfo.url, { waitUntil: "load", timeout: 20000 });
        console.log("⏳ Esperando 5 segundos para render de animaciones y datos reales...");
        await page.waitForTimeout(5000);

        // Remover banners de cookies u overlays
        await page.evaluate(() => {
          const overlays = document.querySelectorAll("[class*='cookie'], [id*='cookie'], [class*='popup'], [class*='modal']");
          overlays.forEach(el => el.remove());
        }).catch(() => {});

        // Desplazamiento progresivo para disparar lazy loading de imágenes y animaciones de scroll
        console.log("⏬ Desplazando página progresivamente para forzar lazy load...");
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 150;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;

              if (totalHeight >= scrollHeight || totalHeight > 10000) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
        
        // Volver arriba para tomar captura impecable
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1500);

        const filename = `screenshot_${pageInfo.name}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);

        console.log(`📸 Capturando LANDING COMPLETA (fullPage: true)...`);
        await page.screenshot({ path: filepath, fullPage: true });
        console.log(`✅ ¡Guardado con éxito!: ${filename}`);
      } catch (err) {
        console.error(`❌ Error capturando ${pageInfo.name}:`, err.message);
      }
    }

    console.log("\n✨ === PROCESO DE CAPTURAS COMPLETAS CON EXITO ===");
    process.exit(0);

  } catch (error) {
    console.error("💥 Error de conexión CDP con Chrome:", error.message);
    console.log("💡 ¿Está tu navegador Google Chrome abierto con la extensión Playwriter corriendo?");
    process.exit(1);
  }
}

captureFullPages();
