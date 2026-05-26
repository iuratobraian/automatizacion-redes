/**
 * compile-promo-video.mjs — TradeShare Video Compilation and Post-Production Engine
 * Utiliza FFmpeg instalado localmente para compilar, concatenar y transcodificar
 * los videos individuales en 4K de cada sector en un solo anuncio master en formato WebM y MP4.
 * Adaptado para usar codificadores de hardware Intel QSV (h264_qsv) o fallback universal software (mpeg4).
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VIDEO_DIR = path.join(ROOT, "public", "generated_posts", "videos");

const SECTORS = ["home", "marketplace", "comunidad", "precios", "bitacora", "exness", "psicotrading"];

async function compileVideo() {
  console.log("🎬 === INICIANDO COMPILACIÓN DE VIDEO MAESTRO PUBLICITARIO ===");
  
  // 1. Verificar existencia de todos los videos de sectores
  console.log("🔍 Validando que existan todas las grabaciones 4K...");
  const missing = [];
  const videoPaths = [];

  for (const sector of SECTORS) {
    const filename = `tradeshare_4k_${sector}.webm`;
    const filepath = path.join(VIDEO_DIR, filename);
    if (!fs.existsSync(filepath)) {
      missing.push(filename);
    } else {
      videoPaths.push(filepath);
    }
  }

  if (missing.length > 0) {
    console.error(`❌ Grabaciones faltantes detectadas: ${missing.join(", ")}`);
    console.log("💡 Por favor, ejecuta primero: node automatizacion-redes/record-promo-sectors-4k.mjs");
    process.exit(1);
  }

  console.log("✅ Todos los sectores se encuentran grabados en 4K.");

  // 2. Crear archivo txt para el demuxer concat de FFmpeg
  const txtPath = path.join(VIDEO_DIR, "concat_list.txt");
  let fileContent = "";
  for (const filepath of videoPaths) {
    const escapedPath = filepath.replace(/'/g, "'\\''");
    fileContent += `file '${escapedPath}'\n`;
  }
  fs.writeFileSync(txtPath, fileContent, "utf8");
  console.log(`📝 Lista de concatenación escrita en: concat_list.txt`);

  const outputWebm = path.join(VIDEO_DIR, "tradeshare_master_4k_promo.webm");
  const outputMp4 = path.join(VIDEO_DIR, "tradeshare_master_4k_promo.mp4");

  // 3. Ejecutar concatenación FFmpeg (Copia lossless ultra-rápida)
  console.log("\n⚡ Concatenando videos de forma instantánea sin pérdida...");
  try {
    const cmdConcat = `ffmpeg -y -f concat -safe 0 -i "${txtPath}" -c copy "${outputWebm}"`;
    execSync(cmdConcat, { stdio: "inherit" });
    console.log(`✅ Video Maestro WebM 4K compilado: tradeshare_master_4k_promo.webm`);
  } catch (err) {
    console.error("⚠️ Falló concatenación directa sin pérdidas. Intentando transcodificación de respaldo...");
    try {
      const cmdConcatTranscode = `ffmpeg -y -f concat -safe 0 -i "${txtPath}" -c:v libvpx-vp9 -crf 32 -b:v 0 -an "${outputWebm}"`;
      execSync(cmdConcatTranscode, { stdio: "inherit" });
      console.log(`✅ Video Maestro WebM 4K compilado mediante transcodificación.`);
    } catch (transErr) {
      console.error("💥 Error fatal al concatenar videos:", transErr.message);
      process.exit(1);
    }
  }

  // 4. Convertir a MP4
  console.log("\n🎨 Transcodificando a formato MP4 compatible con Redes Sociales...");
  
  // Intentar primero h264_qsv (Intel Quick Sync aceleración por hardware)
  let success = false;
  try {
    console.log("🚀 Probando codificador acelerado por hardware Intel QSV (h264_qsv)...");
    const cmdMp4Qsv = `ffmpeg -y -i "${outputWebm}" -c:v h264_qsv -pix_fmt yuv420p -global_quality 20 "${outputMp4}"`;
    execSync(cmdMp4Qsv, { stdio: "inherit" });
    console.log("✅ Compilación exitosa usando h264_qsv.");
    success = true;
  } catch (err) {
    console.log("ℹ️ h264_qsv no está disponible o falló en el entorno virtual actual. Intentando fallback universal...");
  }

  // Fallback 1: Codificador de software nativo compatible MPEG4
  if (!success) {
    try {
      console.log("💻 Ejecutando fallback con codificador universal MPEG-4...");
      const cmdMp4Mpeg = `ffmpeg -y -i "${outputWebm}" -c:v mpeg4 -vtag mp4v -qscale:v 3 "${outputMp4}"`;
      execSync(cmdMp4Mpeg, { stdio: "inherit" });
      console.log("✅ Compilación exitosa usando códec universal mpeg4.");
      success = true;
    } catch (err) {
      console.error("❌ Falló el fallback mpeg4:", err.message);
    }
  }

  if (success) {
    console.log(`\n🎉 ¡COMPILACIÓN DE VIDEO MÁSTER COMPLETADA CON ÉXITO!`);
    console.log(`📹 Archivo maestro WebM 4K: public/generated_posts/videos/tradeshare_master_4k_promo.webm`);
    console.log(`📹 Archivo listo para Redes MP4 4K: public/generated_posts/videos/tradeshare_master_4k_promo.mp4`);
  } else {
    console.error("\n💥 No se pudo exportar el video a formato MP4. Sin embargo, tu archivo maestro WebM 4K está intacto y guardado.");
  }

  // Limpiar archivo de texto temporal
  if (fs.existsSync(txtPath)) {
    fs.unlinkSync(txtPath);
  }

  process.exit(0);
}

compileVideo();
