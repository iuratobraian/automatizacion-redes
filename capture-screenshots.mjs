/**
 * capture-screenshots.mjs — TradeShare Smart Screenshot Generator
 * Captura capturas de pantalla de alta fidelidad (Desktop y Mobile) del portal local
 * para utilizarlos como material promocional y de marketing interactivo.
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "public", "generated_posts");

// Asegurar que exista el directorio de destino
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true }
};

const PAGES = [
  { name: "home", url: "http://localhost:3000/" },
  { name: "marketplace", url: "http://localhost:3000/marketplace" },
  { name: "comunidad", url: "http://localhost:3000/comunidad" },
  { name: "pricing", url: "http://localhost:3000/precios" },
  { name: "bitacora", url: "http://localhost:3000/bitacora" },
  { name: "exness", url: "http://localhost:3000/exness" },
  { name: "psicotrading", url: "http://localhost:3000/psicotrading" }
];

async function capture() {
  console.log("📸 INICIANDO CAPTURA AUTOMATIZADA DE SECTORES DE TRADESHARE...");
  console.log(`📂 Guardando en: ${OUTPUT_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    for (const pageInfo of PAGES) {
      console.log(`\n🌍 Procesando sección: ${pageInfo.name.toUpperCase()} (${pageInfo.url})`);
      
      // Capturar vista Desktop
      const contextDesktop = await browser.newContext({
        viewport: VIEWPORTS.desktop,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      });
      const pageDesktop = await contextDesktop.newPage();
      
      try {
        console.log(`🖥️  Capturando versión Desktop...`);
        await pageDesktop.goto(pageInfo.url, { waitUntil: "load", timeout: 35000 });
        console.log("   ⏳ Esperando cargadores y skeletons...");
        await pageDesktop.waitForTimeout(2000);
        
        try {
          await pageDesktop.waitForFunction(() => {
            const loaders = document.querySelectorAll('.loader, .spinner, [class*="loading"], [id*="loading"], .skeleton, [class*="skeleton"]');
            const loadersHidden = loaders.length === 0 || Array.from(loaders).every(el => el.getBoundingClientRect().height === 0);
            
            const electricLoaders = Array.from(document.querySelectorAll('div')).filter(el => {
              const style = window.getComputedStyle(el);
              return (
                (el.className && el.className.includes('z-[9999]')) || 
                el.innerText?.includes('Preparando TradeShare') || 
                el.innerText?.includes('Aurora Terminal')
              ) && style.opacity !== '0' && style.display !== 'none' && style.visibility !== 'hidden';
            });
            
            return loadersHidden && electricLoaders.length === 0;
          }, { timeout: 25000 });
        } catch (e) {
          console.log("   ℹ️ Expiró espera de cargadores. Procediendo...");
        }
        await pageDesktop.waitForTimeout(3000);
        
        // Remover elementos flotantes molestos como popups de cookies si existieran
        await pageDesktop.evaluate(() => {
          const cookieBanners = document.querySelectorAll("[class*='cookie'], [id*='cookie'], [class*='popup'], [class*='modal']");
          cookieBanners.forEach(el => el.remove());
        }).catch(() => {});

        const desktopFilename = `screenshot_${pageInfo.name}_desktop.png`;
        const desktopPath = path.join(OUTPUT_DIR, desktopFilename);
        
        await pageDesktop.screenshot({ path: desktopPath });
        console.log(`✅ Guardado: ${desktopFilename}`);
      } catch (err) {
        console.error(`❌ Error en Desktop para ${pageInfo.name}:`, err.message);
      } finally {
        await pageDesktop.close();
        await contextDesktop.close();
      }

      // Capturar vista Mobile
      const contextMobile = await browser.newContext({
        viewport: { width: VIEWPORTS.mobile.width, height: VIEWPORTS.mobile.height },
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        isMobile: true,
        hasTouch: true
      });
      const pageMobile = await contextMobile.newPage();

      try {
        console.log(`📱 Capturando versión Mobile...`);
        await pageMobile.goto(pageInfo.url, { waitUntil: "load", timeout: 35000 });
        console.log("   ⏳ Esperando cargadores y skeletons...");
        await pageMobile.waitForTimeout(8000);
        
        try {
          await pageMobile.waitForFunction(() => {
            const loaders = document.querySelectorAll('.loader, .spinner, [class*="loading"], [id*="loading"], .skeleton, [class*="skeleton"]');
            return loaders.length === 0 || Array.from(loaders).every(el => el.getBoundingClientRect().height === 0);
          }, { timeout: 12000 });
        } catch (e) {
          console.log("   ℹ️ No se detectó spinner persistente o ya terminó de cargar.");
        }
        await pageMobile.waitForTimeout(3000);
        
        const mobileFilename = `screenshot_${pageInfo.name}_mobile.png`;
        const mobilePath = path.join(OUTPUT_DIR, mobileFilename);
        
        await pageMobile.screenshot({ path: mobilePath });
        console.log(`✅ Guardado: ${mobileFilename}`);
      } catch (err) {
        console.error(`❌ Error en Mobile para ${pageInfo.name}:`, err.message);
      } finally {
        await pageMobile.close();
        await contextMobile.close();
      }
    }
  } catch (error) {
    console.error("💥 Error fatal en el capturador:", error.message);
  } finally {
    await browser.close();
    console.log("\n✨ ¡PROCESO DE CAPTURAS COMPLETADO CON EXITO!");
  }
}

capture();
