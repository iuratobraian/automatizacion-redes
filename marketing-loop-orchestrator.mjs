import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT = process.cwd();
const VAULT_PATH = path.join(ROOT, '.agent', 'marketing_vault.json');
const STATE_FILE = path.join(ROOT, '.agent', 'marketing_state.json');

// Leer y guardar el estado de rotación de bloques de 2
function getRotationState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {}
  }
  return { engine: 'chatgpt', count: 0 };
}

function saveRotationState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

function getLatestVaultEntry() {
  if (!fs.existsSync(VAULT_PATH)) return null;
  try {
    const vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    return vault[vault.length - 1];
  } catch (e) {
    return null;
  }
}

async function runTask(command, name) {
  console.log(`\n🚀 [${name}] Ejecutando: ${command}`);
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'inherit' });
    return { success: true, output };
  } catch (error) {
    console.error(`\n❌ [${name}] FALLÓ:`, error.message);
    return { success: false, error };
  }
}

// Buscar la última imagen física generada por un prefijo de motor específico
function getLatestGeneratedImage(prefix) {
  const postsDir = path.join(ROOT, 'public', 'generated_posts');
  if (!fs.existsSync(postsDir)) return null;
  
  const files = fs.readdirSync(postsDir)
    .filter(f => f.endsWith('.png') && f.includes(prefix))
    .map(f => ({ name: f, time: fs.statSync(path.join(postsDir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
    
  return files.length > 0 ? path.join('public', 'generated_posts', files[0].name) : null;
}

// Generador local inteligente en caso de falla de Playwright en inicio de sesión/captcha
function runLocalFallbackGenerator(engineName) {
  console.log(`\n🛟 [FALLBACK MOTOR LOCAL] Ejecutando generador local inteligente para ${engineName.toUpperCase()}...`);
  
  let copywritingLibrary = {
    hooks: [
      "Dejá de saltar entre Discord, Zoom, Drive y planillas Excel. Unificá todo en un solo ecosistema.",
      "El 95% de los traders pierden por falta de disciplina, no por falta de estrategia. ¿De qué lado querés estar?",
      "No necesitás otra cuenta financiada. Necesitás automatizar tu bitácora de trading y controlar tu psicología.",
      "Para líderes de comunidad: construí tu marca propia con TV en vivo y cursos de IA. TradeShare hace el trabajo pesado."
    ],
    topics: [
      "Disciplina y Plan de Trading riguroso.",
      "Gestión de Riesgo y preservación de capital.",
      "Psicología y el control absoluto del FOMO en Forex.",
      "Consistencia a largo plazo mediante el interés compuesto."
    ]
  };

  // Intentar leer la bóveda de temas/estrategia si existe
  const strategyPath = path.join(ROOT, '.agent', 'marketing_vault.json');
  if (fs.existsSync(strategyPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(strategyPath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        // Aprovechar copias que ya hayan servido anteriormente
        const randomPast = data[Math.floor(Math.random() * data.length)];
        if (randomPast.copy) {
          copywritingLibrary.hooks.push(randomPast.copy);
        }
      }
    } catch(e){}
  }

  // Elegir hook y tema aleatorio
  const hook = copywritingLibrary.hooks[Math.floor(Math.random() * copywritingLibrary.hooks.length)];
  const topic = copywritingLibrary.topics[Math.floor(Math.random() * copywritingLibrary.topics.length)];

  const frase = `¡MINDSET TRADING AUTOMATIZADO! 📈`;
  const copy = `¿Seguís perdiendo tiempo operando sin bitácora? 🚀\n\n${hook}\n\nEnfoque clave de hoy: ${topic} TradeShare te unifica la bitácora con IA, TradingView integrado y psicotrading sin dar más vueltas. Comentá la palabra "INFO" abajo y te mando acceso directo por DM de inmediato de forma automatizada.`;

  // Buscar una imagen existente en generated_posts
  const postsDir = path.join(ROOT, 'public', 'generated_posts');
  let selectedImg = null;
  
  if (fs.existsSync(postsDir)) {
    const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.png') && !f.includes('debug'));
    if (files.length > 0) {
      selectedImg = path.join('public', 'generated_posts', files[Math.floor(Math.random() * files.length)]);
    }
  }

  if (!selectedImg) {
    selectedImg = 'public/generated_posts/fallback_trading.png';
    const fallbackPath = path.join(ROOT, selectedImg);
    if (!fs.existsSync(path.dirname(fallbackPath))) {
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    }
    // Si no hay imagen de fallback física, crear una en blanco de prueba
    if (!fs.existsSync(fallbackPath)) {
      fs.writeFileSync(fallbackPath, '');
    }
  }

  // Registrar en la Bóveda de Contenidos (.agent/marketing_vault.json)
  let vault = [];
  if (fs.existsSync(VAULT_PATH)) {
    try {
      vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    } catch(e){}
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const fileName = path.basename(selectedImg);
  
  const vaultEntry = {
    id: `vault_${Date.now()}`,
    date: todayStr,
    timestamp: Date.now(),
    frase: frase,
    copy: copy,
    imagenUrl: `/generated_posts/${fileName}`,
    communitySlug: 'forex-traders-hub',
    communityPostUrl: `http://localhost:3000/comunidad/forex-traders-hub`,
    instagramFeedUrl: null,
    instagramStoryPosted: false
  };

  vault.push(vaultEntry);
  fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2), 'utf8');
  console.log('💾 [FALLBACK] ¡Campañas registradas con éxito en la Bóveda de Contenidos!');

  return { frase, copy, imagePath: selectedImg };
}

async function main() {
  console.log('========================================================================');
  console.log('🌟 ORQUESTADOR ROTATIVO DE MARKETING DUAL AURORA V4.0 🌟');
  console.log('========================================================================');
  
  const state = getRotationState();
  console.log(`🔄 [SISTEMA ROTATIVO] Motor asignado: ${state.engine.toUpperCase()}`);
  console.log(`📊 [ESTADO] Iteración: #${state.count + 1} de 2 en este bloque de ejecución.`);
  console.log('========================================================================');

  const report = {
    timestamp: new Date().toISOString(),
    engine: state.engine,
    iteration: state.count + 1,
    platforms: { instagram: 'skipped', threads: 'skipped', facebook: 'skipped' },
    success: false
  };

  let executionSuccess = false;
  let latestImgPath = null;

  // Intentar la generación Playwright interactiva
  try {
    if (state.engine === 'chatgpt') {
      console.log('\n--- BLOQUE CHATGPT (Generación) ---');
      const result = await runTask('node automatizacion-redes/chatgpt-generator.mjs --use-vault --category=ganchos_calientes', 'ChatGPT');
      executionSuccess = result.success;
      
      if (executionSuccess) {
        const postsDir = path.join(ROOT, 'public', 'generated_posts');
        const files = fs.readdirSync(postsDir)
          .filter(f => f.endsWith('.png') && !f.includes('gemini') && !f.includes('manus') && !f.includes('meta') && !f.includes('debug'))
          .map(f => ({ name: f, time: fs.statSync(path.join(postsDir, f)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time);
        if (files.length > 0) {
          latestImgPath = path.join('public', 'generated_posts', files[0].name);
        }
      }
    } 
    else if (state.engine === 'gemini') {
      console.log('\n--- BLOQUE GEMINI (Generación) ---');
      const result = await runTask('node automatizacion-redes/gemini-generator.mjs --use-vault --category=ganchos_calientes', 'Gemini');
      executionSuccess = result.success;
      if (executionSuccess) {
        latestImgPath = getLatestGeneratedImage('gemini');
      }
    } 
    else if (state.engine === 'manus') {
      console.log('\n--- BLOQUE MANUS.AI (Generación) ---');
      const result = await runTask('node automatizacion-redes/manus-generator.mjs --use-vault', 'Manus.im');
      executionSuccess = result.success;
      if (executionSuccess) {
        latestImgPath = getLatestGeneratedImage('manus');
      }
    } 
    else if (state.engine === 'meta') {
      console.log('\n--- BLOQUE META AI (Generación) ---');
      const result = await runTask('node automatizacion-redes/meta-generator.mjs --use-vault --category=frases_motivacion --publish=false', 'Meta AI');
      executionSuccess = result.success;
      if (executionSuccess) {
        latestImgPath = getLatestGeneratedImage('meta');
      }
    }
  } catch (e) {
    console.error('⚠️ Generación de IA falló o arrojó excepción:', e.message);
    executionSuccess = false;
  }

  // GATILLAR EL MOTOR DE RESPALDO (FALLBACK) SI LA GENERACIÓN IA FALLÓ O NO GUARDÓ IMAGEN
  if (!executionSuccess || !latestImgPath) {
    console.log('⚠️ El generador interactivo Playwright falló o no se autenticó. Iniciando Motor Local de Respaldo...');
    const fallback = runLocalFallbackGenerator(state.engine);
    latestImgPath = fallback.imagePath;
    executionSuccess = true;
  }

  // PUBLICACIÓN MULTIPLATAFORMA (INSTAGRAM, THREADS, FACEBOOK)
  if (latestImgPath) {
    const entry = getLatestVaultEntry() || {
      frase: 'Disciplina de Trading',
      copy: 'La constancia diaria es lo que separa a los aficionados de los profesionales en TradeShare. Opera con un plan. www.trade-share.com'
    };
    
    const fullImagePath = path.join(ROOT, latestImgPath);
    const caption = `${entry.frase}\n\n${entry.copy}\n\n#TradeShare #Trading #Forex #IA #Automatizacion`;
    const cleanCaptionForCli = caption.replace(/"/g, '\\"').replace(/`/g, '\\`');

    // 1. PUBLICACIÓN EN INSTAGRAM
    console.log(`\n📸 [Instagram] Iniciando publicación en Instagram (${state.engine === 'meta' ? 'STORY' : 'FEED'})...`);
    let igCommand = '';
    if (state.engine === 'meta') {
      igCommand = `node automatizacion-redes/ig-publisher.mjs --type=story --image="${fullImagePath}"`;
    } else {
      igCommand = `node automatizacion-redes/ig-publisher.mjs --type=feed --image="${fullImagePath}" --caption="${cleanCaptionForCli}"`;
    }
    const pubIgResult = await runTask(igCommand, 'Instagram Publisher');
    if (pubIgResult.success) {
      report.platforms.instagram = 'published';
    }

    // 2. PUBLICACIÓN EN THREADS
    console.log('\n🧵 [Threads] Iniciando publicación automatizada de hilo...');
    const pubThreadsResult = await runTask(`node automatizacion-redes/threads-publisher.mjs --text="${cleanCaptionForCli}"`, 'Threads Publisher');
    if (pubThreadsResult.success) {
      report.platforms.threads = 'published';
    }

    // 3. PUBLICACIÓN EN FACEBOOK GROUPS
    console.log('\n👥 [Facebook] Iniciando publicación automatizada en grupos...');
    const pubFbResult = await runTask(`node automatizacion-redes/facebook-publisher.mjs --text="${cleanCaptionForCli}"`, 'Facebook Publisher');
    if (pubFbResult.success) {
      report.platforms.facebook = 'published';
    }

    report.success = true;
  }

  // Avanzar la rotación del bloque de 2
  if (executionSuccess) {
    state.count += 1;
    if (state.count >= 2) {
      const engines = ['chatgpt', 'gemini', 'manus', 'meta'];
      const currentIndex = engines.indexOf(state.engine);
      const nextIndex = (currentIndex + 1) % engines.length;
      state.engine = engines[nextIndex];
      state.count = 0;
      console.log(`\n🔄 [ROTACIÓN] ¡Bloque de 2 completado! Siguiente motor asignado: ${state.engine.toUpperCase()}`);
    }
    saveRotationState(state);
  }

  console.log('\n✨ [ORQUESTADOR] Ciclo de marketing multi-plataforma completado.');
  console.log('REPORT_JSON_START');
  console.log(JSON.stringify(report, null, 2));
  console.log('REPORT_JSON_END');
}

main().catch(err => {
  console.error('❌ Error fatal en el orquestador:', err.message);
  process.exit(1);
});
