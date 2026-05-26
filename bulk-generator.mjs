/**
 * bulk-generator.mjs — TradeShare Massive Content Generator
 * Ejecuta el orquestador repetidamente para llenar la bóveda (marketing_vault.json)
 * hasta que se alcance un límite o el usuario lo detenga.
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MAX_ATTEMPTS = 50; // Límite de seguridad
const DELAY_BETWEEN = 5000; // 5 segundos entre generaciones

async function main() {
    const countArg = process.argv.find(a => a.startsWith('--count='))?.split('=')[1];
    const count = countArg ? parseInt(countArg) : 10;

    console.log('========================================================================');
    console.log(`🚀 GENERADOR MASIVO TRADESHARE — Objetivo: ${count} posts nuevos`);
    console.log('========================================================================');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < count && i < MAX_ATTEMPTS; i++) {
        console.log(`\n📦 [${i + 1}/${count}] Iniciando generación...`);
        
        try {
            // Ejecutar orquestador en modo solo generación
            execSync('node automatizacion-redes/marketing-loop-orchestrator.mjs --generate-only', { 
                cwd: ROOT, 
                stdio: 'inherit' 
            });
            
            successCount++;
            console.log(`✅ Generación #${i + 1} exitosa.`);
        } catch (e) {
            failCount++;
            console.error(`❌ Generación #${i + 1} falló.`);
            // Si hay 3 fallos seguidos, quizás llegamos al límite de la IA
            if (failCount >= 3 && successCount === 0) {
                console.error('\n🛑 Demasiados fallos consecutivos. Abortando para proteger límites.');
                break;
            }
        }

        if (i < count - 1) {
            console.log(`😴 Esperando ${DELAY_BETWEEN/1000}s para el siguiente...`);
            await new Promise(r => setTimeout(r, DELAY_BETWEEN));
        }
    }

    console.log('\n========================================================================');
    console.log('✨ RESUMEN DE GENERACIÓN MASIVA');
    console.log(`   ✅ Exitosos: ${successCount}`);
    console.log(`   ❌ Fallidos: ${failCount}`);
    console.log(`   📂 Todo el contenido está guardado en .agent/marketing_vault.json`);
    console.log('========================================================================');
}

main().catch(err => console.error('💥 Error fatal en Bulk Generator:', err));
