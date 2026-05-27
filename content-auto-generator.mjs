/**
 * content-auto-generator.mjs — Auto-generador de Contenido TradeShare V2
 * Genera 15 imágenes automáticas al día (5 ChatGPT, 5 Gemini, 5 Meta AI).
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { generateBatchPrompts } from './prompt-engine.mjs';
import { readPostsDB, savePostsDB, readStatsDB, saveStatsDB } from './data-manager.mjs';

const execAsync = promisify(exec);
import { fileURLToPath } from 'url';
const __dirnameCAG = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirnameCAG, '..');
const VAULT_FILE = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');

// Estado global para controlar si hay una generación en curso
let isGenerating = false;
let lastGenerationLog = [];

export function getGeneratorStatus() {
  return {
    isGenerating,
    logs: lastGenerationLog
  };
}

function logGen(msg) {
  const line = `[${new Date().toLocaleTimeString('es-AR')}] ${msg}`;
  console.log(line);
  lastGenerationLog.push(line);
  if (lastGenerationLog.length > 50) lastGenerationLog.shift();
}

/**
 * Mueve un archivo de un origen a un destino de forma segura
 */
function moveFile(src, dest) {
  try {
    if (!fs.existsSync(src)) {
      logGen(`⚠️ Archivo origen no existe para mover: ${src}`);
      return false;
    }
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.renameSync(src, dest);
    return true;
  } catch (err) {
    logGen(`❌ Error moviendo archivo de ${src} a ${dest}: ${err.message}`);
    return false;
  }
}

/**
 * Genera 15 publicaciones completas del día de forma asíncrona
 */
export async function generateDailyContent() {
  if (isGenerating) {
    logGen("⚠️ Ya existe una generación de contenido en curso. Operación abortada.");
    return;
  }

  isGenerating = true;
  lastGenerationLog = [];
  logGen("🎨 Iniciando Generador Automático Diario (15 imágenes)...");

  try {
    // 1. Obtener 20 prompts de trading balanceados (5 extra para Arena.ai)
    const batchPrompts = generateBatchPrompts(20);
    logGen("📝 20 Prompts de trading creados por el Prompt Engine.");

    const batches = [
      { script: 'chatgpt-generator.mjs', prompts: batchPrompts.slice(0, 5), prefix: 'chatgpt' },
      { script: 'gemini-generator.mjs',  prompts: batchPrompts.slice(5, 10), prefix: 'gemini' },
      { script: 'meta-generator.mjs',    prompts: batchPrompts.slice(10, 15), prefix: 'meta' },
      { script: 'arena-generator.mjs',   prompts: batchPrompts.slice(15, 20), prefix: 'arena' }
    ];

    let successCount = 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const generatedDirRelative = path.join('media', 'generated', todayStr);
    const generatedDirAbsolute = path.join(PROJECT_ROOT, generatedDirRelative);

    if (!fs.existsSync(generatedDirAbsolute)) {
      fs.mkdirSync(generatedDirAbsolute, { recursive: true });
    }

    for (const batch of batches) {
      logGen(`🚀 Iniciando lote de 5 imágenes con proveedor: [${batch.prefix.toUpperCase()}]`);

      for (let i = 0; i < batch.prompts.length; i++) {
        const promptObj = batch.prompts[i];
        logGen(`👉 [${batch.prefix.toUpperCase()} ${i+1}/5] Generando: "${promptObj.suggestedTitle}"`);

        // Leer el estado de la bóveda antes de ejecutar para buscar el delta
        let beforeVault = [];
        if (fs.existsSync(VAULT_FILE)) {
          try {
            beforeVault = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf-8'));
          } catch (e) {}
        }

        try {
          const cmd = `node automatizacion-redes/${batch.script} --topic="${promptObj.prompt.replace(/"/g, '\\"')}" --publish=false`;
          
          // Esperar un máximo de 5 minutos por generación (300000 ms)
          const { stdout } = await execAsync(cmd, { timeout: 300000, cwd: PROJECT_ROOT });
          logGen(`✅ Subproceso finalizado exitosamente.`);

          // Leer la bóveda para encontrar la nueva entrada generada
          let afterVault = [];
          if (fs.existsSync(VAULT_FILE)) {
            try {
              afterVault = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf-8'));
            } catch (e) {}
          }

          // Encontrar la entrada más reciente agregada por el script
          const newEntry = afterVault.find(item => !beforeVault.some(b => b.id === item.id || b.imageUrl === item.imageUrl || b.imagenUrl === item.imagenUrl));

          if (newEntry) {
            const tempUrl = newEntry.imagenUrl || newEntry.imageUrl; // ej: "/images/feed/trading_post_gemini_1779831089855.png"
            const tempFileName = path.basename(tempUrl);
            const isHistoria = batch.prefix === 'meta';
            const folderName = isHistoria ? 'historias' : 'feed';

            const finalFileName = tempFileName;
            const finalFileRelative = `/images/${folderName}/${finalFileName}`;
            const filepath = `./public/images/${folderName}/${finalFileName}`;

            // Dar de alta en posts-db.json en estado Draft
            const db = readPostsDB();
            const newPost = {
              id: `post_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              filename: finalFileRelative,
              filepath: filepath,
              source: "auto-generated",
              title: promptObj.suggestedTitle,
              category: promptObj.category,
              tags: [promptObj.category, batch.prefix],
              status: "Draft",
              captions: [
                {
                  id: "c1",
                  label: "Caption Principal",
                  text: newEntry.copy || promptObj.suggestedCaption,
                  hashtags: "#trading #tradeshare",
                  platform_variants: {
                    ig_feed: newEntry.copy || promptObj.suggestedCaption,
                    ig_story: "¡Mentalidad de Trading! 🚀 trade-share.com",
                    threads: (newEntry.copy || promptObj.suggestedCaption).split('#')[0].trim(),
                    tradeshare_free: newEntry.copy || promptObj.suggestedCaption,
                    tradeshare_vip: newEntry.copy || promptObj.suggestedCaption
                  },
                  isDefault: true,
                  createdAt: new Date().toISOString()
                }
              ],
              scheduled: [],
              published: [],
              recycleAfterDays: 30,
              createdAt: new Date().toISOString(),
              generatedBy: batch.prefix
            };

            db.posts.push(newPost);
            savePostsDB(db);
            successCount++;
            logGen(`💾 Registrado en posts-db.json en estado [Draft]: ${finalFileName}`);
          } else {
            logGen(`⚠️ No se detectó entrada nueva en marketing_vault.json para este ciclo.`);
          }

        } catch (err) {
          logGen(`❌ Error en subproceso de generación: ${err.message}`);
        }
      }
    }

    logGen(`🎉 Proceso completado. Se generaron con éxito ${successCount}/15 imágenes.`);
    
    // Actualizar estadísticas globales
    const stats = readStatsDB();
    stats.imagesGeneratedToday = (stats.imagesGeneratedToday || 0) + successCount;
    saveStatsDB(stats);

  } catch (globalErr) {
    logGen(`💥 Falla crítica en generateDailyContent: ${globalErr.message}`);
  } finally {
    isGenerating = false;
  }
}
