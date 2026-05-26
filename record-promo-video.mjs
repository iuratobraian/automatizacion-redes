/**
 * record-promo-video.mjs — TradeShare Auto-Recording Promotional Engine
 * Genera un video promocional HD (.webm/.mp4) de forma 100% automatizada
 * recorriendo y haciendo scroll interactivo suave por toda la plataforma.
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
  { name: "1_Home", url: "http://localhost:3000/" },
  { name: "2_Marketplace", url: "http://localhost:3000/marketplace" },
  { name: "3_Comunidades", url: "http://localhost:3000/comunidad" },
  { name: "4_Psicotrading", url: "http://localhost:3000/psicotrading" }
];

async function recordPromo() {
  console.log("🎥 === INICIANDO GRABACIÓN AUTOMÁTICA DE VIDEO PROMOCIONAL ===");
  console.log(`📂 Los videos se guardarán en: ${VIDEO_DIR}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1280, height: 720 }
    },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  try {
    for (const pageInfo of PAGES) {
      console.log(`\n📹 Grabando sección: ${pageInfo.name} (${pageInfo.url})`);
      
      // Ir a la página
      await page.goto(pageInfo.url, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(3000); // Pausa inicial para que el espectador vea el encabezado

      // Eliminar elementos flotantes
      await page.evaluate(() => {
        const banners = document.querySelectorAll("[class*='cookie'], [id*='cookie'], [class*='popup'], [class*='modal']");
        banners.forEach(el => el.remove());
      }).catch(() => {});

      // Realizar un scroll muy suave y pausado imitando la navegación humana de lectura
      console.log("⏬ Realizando scroll cinematográfico hacia abajo...");
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 8; // Pasos pequeños para máxima suavidad
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            // Grabar hasta 1400px de altura para mantener el video dinámico
            if (totalHeight >= scrollHeight || totalHeight > 1400) {
              clearInterval(timer);
              resolve();
            }
          }, 15); // Intervalo rápido para 60fps de suavidad
        });
      });

      await page.waitForTimeout(2000); // Pausa al final de la página

      // Volver arriba de forma fluida
      console.log("⏫ Volviendo al tope de la página...");
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      await page.waitForTimeout(3000); // Esperar que termine el scroll smooth
    }

    // Cerrar contextos para que Playwright consolide y guarde el archivo de video en disco
    await page.close();
    await context.close();
    await browser.close();

    // Buscar y renombrar el video generado
    const files = fs.readdirSync(VIDEO_DIR);
    const videoFile = files.find(f => f.endsWith(".webm"));
    
    if (videoFile) {
      const oldPath = path.join(VIDEO_DIR, videoFile);
      const newPath = path.join(VIDEO_DIR, "tradeshare_promo_60fps.webm");
      fs.renameSync(oldPath, newPath);
      console.log(`\n🎉 ¡Video promocional HD grabado con éxito!`);
      console.log(`📹 Archivo guardado: public/generated_posts/videos/tradeshare_promo_60fps.webm`);
    } else {
      console.log("\n⚠️ Video grabado pero no se localizó el archivo temporal para renombrarlo.");
    }

    process.exit(0);

  } catch (error) {
    console.error("💥 Error en la grabación cinematográfica:", error.message);
    process.exit(1);
  }
}

recordPromo();
