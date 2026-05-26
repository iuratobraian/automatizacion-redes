import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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
    return vault[0];
  } catch (e) {
    return null;
  }
}

async function runTask(command, name) {
  console.log(`\n🚀 [${name}] Ejecutando: ${command}`);
  try {
    const output = execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
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
  
  const postsDir = path.join(ROOT, 'public', 'generated_posts');
  let selectedImg = null;
  let frase = '';
  let copy = '';
  let communitySlug = 'forex-traders-hub';

  // 1. Mapeo de Campañas Estratégicas basadas en las capturas de pantalla de los sectores
  const campaigns = [
    {
      screenshotFeedName: 'screenshot_marketplace_desktop.png',
      screenshotStoryName: 'screenshot_marketplace_mobile.png',
      frase: '🚀 MARKETPLACE TRADESHARE: MONETIZÁ TU CONOCIMIENTO 🚀',
      copy: '¿Cansado de regalar tu esfuerzo en grupos gratis de Telegram? En el Marketplace de TradeShare podés vender tus estrategias, indicadores exclusivos y mentorías de forma directa. Cobrá tus ganancias inmediatamente sin dar comisiones abusivas a intermediarios.\n\nDejá de saltar entre MercadoPago y links de drive. TradeShare te da una pasarela de pago pro integrada y soporte premium para tus alumnos. Comentá la palabra "SISTEMA" abajo y te mando los accesos gratis por DM para abrir tu tienda hoy mismo.',
      communitySlug: 'marketplace'
    },
    {
      screenshotFeedName: 'screenshot_bitacora_desktop.png',
      screenshotStoryName: 'screenshot_bitacora_mobile.png',
      frase: '📈 BITÁCORA INTELIGENTE CON ANÁLISIS DE IA 📈',
      copy: 'Si no medís tus operaciones, no estás haciendo trading; estás apostando. La bitácora automatizada de TradeShare no solo registra tus entradas, sino que analiza tu psicología operativa para decirte exactamente en qué horario o par estás perdiendo la cabeza.\n\nDejá las planillas Excel manuales en el pasado y empezá a operar con estadísticas reales de nivel institucional. Comentá la palabra "IA" abajo y te activo un bot inteligente por DM para que lo pruebes gratis.',
      communitySlug: 'bitacora'
    },
    {
      screenshotFeedName: 'screenshot_psicotrading_desktop.png',
      screenshotStoryName: 'screenshot_psicotrading_mobile.png',
      frase: '🧠 DOMINÁ EL PSICOTRADING: EL ANÁLISIS DEL FOMO 🧠',
      copy: 'El 95% de los traders fracasan por las emociones. Nuestra sección de Psicotrading te da herramientas avanzadas para mapear tus estados emocionales durante el drawdown, identificar sesgos cognitivos y blindar tu mentalidad ante pérdidas consecutivas.\n\nRegistrá tu nivel de frustración, optimizá tu paciencia y transformá tu psicología. Comentá la palabra "INFO" abajo para recibir tu auditoría de psicotrading en segundos de forma automática por privado.',
      communitySlug: 'psicotrading'
    },
    {
      screenshotFeedName: 'screenshot_exness_desktop.png',
      screenshotStoryName: 'screenshot_exness_mobile.png',
      frase: '🔗 INTEGRACIÓN DIRECTA CON METATRADER 5 Y EXNESS 🔗',
      copy: 'Operá con los spreads más bajos del mercado y conectá tu cuenta de Exness directamente a TradeShare para auditar tus trades de forma 100% transparente y en tiempo real. Máxima seguridad y ejecución instantánea en tus manos.\n\nVisualizá tu curva de equidad, analizá tus métricas institucionales y demostrá tu rentabilidad. Comentá la palabra "HERRAMIENTA" abajo y te envío el link de integración directa por privado.',
      communitySlug: 'exness'
    },
    {
      screenshotFeedName: 'screenshot_home_desktop.png',
      screenshotStoryName: 'screenshot_home_mobile.png',
      frase: '🌟 TRADESHARE: EL ECOSISTEMA DEFINITIVO PARA TRADERS 🌟',
      copy: 'Dejá de saltar entre canales de Discord caóticos, planillas Excel aburridas, Zooms lentos y carpetas de Drive desordenadas. TradeShare unifica todo: gráficos interactivos, bitácora inteligente, análisis de IA, comunidades exclusivas y marketplace en un solo lugar.\n\nUnite a la comunidad de habla hispana con mayor crecimiento y profesionalismo en toda Latinoamérica. Comentá la palabra "COMUNIDAD" abajo y te doy acceso de bienvenida gratuito por DM.',
      communitySlug: 'forex-traders-hub'
    },
    {
      screenshotFeedName: 'screenshot_comunidad_desktop.png',
      screenshotStoryName: 'screenshot_comunidad_mobile.png',
      frase: '👥 COMUNIDADES DE TRADING EXCLUSIVAS Y SEÑALES 👥',
      copy: 'Conectá con traders profesionales, debatí análisis en en vivo y accedé a salas exclusivas de señales y trading grupal. En TradeShare las comunidades tienen sus propios canales de TV integrados, chat interactivo y mentorías 1 a 1 sin ruido de bots.\n\nElegí tus líderes preferidos, creá tu propia comunidad o expandí tu alcance como creador. Comentá la palabra "INFO" abajo y te mando las 10 mejores comunidades gratis por DM.',
      communitySlug: 'forex-traders-hub'
    },
    {
      screenshotFeedName: 'screenshot_pricing_desktop.png',
      screenshotStoryName: 'screenshot_pricing_mobile.png',
      frase: '💎 PLANES TRADESHARE: DESBLOQUEÁ TU MÁXIMO RENDIMIENTO 💎',
      copy: 'Llevá tu trading al siguiente nivel. Accedé a análisis ilimitados de IA, integraciones directas con brokers de primer nivel, salas en vivo exclusivas y el arsenal completo de herramientas institucionales por una suscripción mensual sumamente accesible.\n\nInversión mínima para un retorno profesional incalculable en tu consistencia. Comentá la palabra "ACCESO" abajo y te activo un pase de prueba premium de 3 días por privado.',
      communitySlug: 'pricing'
    }
  ];

  // Intentar seleccionar una campaña que tenga su captura de pantalla física lista
  let matchedCampaign = null;
  if (fs.existsSync(postsDir)) {
    const availableScreenshots = fs.readdirSync(postsDir).filter(f => f.includes('screenshot_') && f.endsWith('.png'));
    if (availableScreenshots.length > 0) {
      // Barajar campañas para rotación inteligente
      const activeCampaigns = campaigns.filter(c => availableScreenshots.includes(c.screenshotFeedName));
      if (activeCampaigns.length > 0) {
        matchedCampaign = activeCampaigns[Math.floor(Math.random() * activeCampaigns.length)];
        selectedImg = path.join('public', 'generated_posts', matchedCampaign.screenshotFeedName);
        frase = matchedCampaign.frase;
        copy = matchedCampaign.copy;
        communitySlug = matchedCampaign.communitySlug;
        console.log(`🎯 [ELEGIDO] Campaña promocional de sector activa con captura: ${matchedCampaign.screenshotFeedName}`);
      }
    }
  }

  // Fallback si no hay capturas de pantalla de sectores
  if (!selectedImg) {
    console.log('⚠️ Capturas de sectores no disponibles. Usando arsenal clásico de copywriting...');
    let library = { hooks: [], topics: [] };
    const libPath = path.join(ROOT, '.agent', 'copywriting_library.json');
    
    if (fs.existsSync(libPath)) {
      try {
        library = JSON.parse(fs.readFileSync(libPath, 'utf8'));
      } catch(e){}
    }

    if (library.hooks.length === 0) {
      library.hooks = ["No necesitás otra cuenta financiada. Necesitás automatizar tu bitácora."];
      library.topics = ["Psicología y el control absoluto del FOMO en Forex."];
    }

    const hook = library.hooks[Math.floor(Math.random() * library.hooks.length)];
    const topic = library.topics[Math.floor(Math.random() * library.topics.length)];

    frase = `¡ESTRATEGIA PRO: ${topic.split(' ')[0].toUpperCase()}! 📈`;
    copy = `${hook} 🚀\n\nEnfoque clave: ${topic}\n\nTradeShare te unifica la bitácora con IA, TradingView integrado y psicotrading sin dar más vueltas. Comentá la palabra "DETALLES" abajo y te mando acceso directo por DM de inmediato de forma automatizada.`;

    // Buscar cualquier otra imagen clásica en generated_posts
    if (fs.existsSync(postsDir)) {
      const files = fs.readdirSync(postsDir).filter(f => 
          f.endsWith('.png') && 
          !f.includes('debug') && 
          !f.includes('screenshot') && 
          !f.includes('dbg') &&
          (f.includes('trading_post') || f.includes('fallback'))
      );
      if (files.length > 0) {
        selectedImg = path.join('public', 'generated_posts', files[Math.floor(Math.random() * files.length)]);
      }
    }
  }

  // Contingencia absoluta final si todo lo anterior fallase
  if (!selectedImg) {
    selectedImg = 'public/generated_posts/fallback_trading.png';
    const fallbackPath = path.join(ROOT, selectedImg);
    if (!fs.existsSync(path.dirname(fallbackPath))) {
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    }
    if (!fs.existsSync(fallbackPath)) {
      const defaultImgSrc = path.join(ROOT, 'public', 'images', 'psicotrading_bg.png');
      if (fs.existsSync(defaultImgSrc)) {
        fs.copyFileSync(defaultImgSrc, fallbackPath);
      } else {
        const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        fs.writeFileSync(fallbackPath, Buffer.from(base64Png, 'base64'));
      }
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
  
  let imagenStoryUrl = null;
  if (matchedCampaign && matchedCampaign.screenshotStoryName) {
    const storyImgPath = path.join('public', 'generated_posts', matchedCampaign.screenshotStoryName);
    if (fs.existsSync(path.join(ROOT, storyImgPath))) {
      imagenStoryUrl = `/generated_posts/${matchedCampaign.screenshotStoryName}`;
    }
  }
  
  const vaultEntry = {
    id: `vault_${Date.now()}`,
    date: todayStr,
    timestamp: Date.now(),
    frase: frase,
    copy: copy,
    imagenUrl: `/generated_posts/${fileName}`,
    imagenStoryUrl: imagenStoryUrl,
    communitySlug: communitySlug,
    communityPostUrl: `http://localhost:3000/comunidad/${communitySlug}`,
    instagramFeedUrl: null,
    instagramStoryPosted: false
  };

  vault.unshift(vaultEntry);
  fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2), 'utf8');
  console.log('💾 [FALLBACK] ¡Campañas registradas con éxito en la Bóveda de Contenidos!');

  return { 
    frase, 
    copy, 
    imagePath: selectedImg, 
    imagenStoryPath: imagenStoryUrl ? path.join(ROOT, imagenStoryUrl.replace(/^\//, '')) : null 
  };
}

async function main() {
  const generateOnly = process.argv.includes('--generate-only');

  console.log('========================================================================');
  console.log('🌟 ORQUESTADOR ROTATIVO DE MARKETING DUAL AURORA V4.0 🌟');
  console.log('========================================================================');
  
  const state = getRotationState();
  console.log(`🔄 [SISTEMA ROTATIVO] Motor asignado: ${state.engine.toUpperCase()}`);
  console.log(`📊 [ESTADO] Iteración: #${state.count + 1} de 2 en este bloque de ejecución.`);
  if (generateOnly) console.log('🛠️ [MODO] GENERAR SOLAMENTE (Stockpiling)');
  console.log('========================================================================');

  const report = {
    timestamp: Date.now(),
    engine: state.engine,
    success: false,
    platforms: {
      instagram: 'skipped',
      threads: 'skipped',
      facebook: 'skipped'
    }
  };

  let executionSuccess = false;
  let latestImgPath = null;
  let activeEngine = state.engine;

  // Lista ordenada de motores para intentar en caso de fallo
  const allEngines = ['chatgpt', 'gemini', 'manus', 'meta'];
  const enginesToTry = [
    state.engine,
    ...allEngines.filter(e => e !== state.engine)
  ];

  console.log(`📋 [PLAN DE INTENTOS AI] Orden de ejecución: ${enginesToTry.map(e => e.toUpperCase()).join(' ➡️ ')}`);

  for (const engineAttempt of enginesToTry) {
    const scriptName = `${engineAttempt}-generator.mjs`;
    const scriptPath = path.join(ROOT, 'automatizacion-redes', scriptName);

    if (fs.existsSync(scriptPath)) {
      console.log(`🤖 [INTENTO AI] Ejecutando: ${scriptName} (Motor: ${engineAttempt.toUpperCase()})...`);
      
      const result = await runTask(`node automatizacion-redes/${scriptName} --publish=false`, engineAttempt.toUpperCase() + ' Generator');
      
      if (result.success) {
        const prefixMap = {
          chatgpt: 'trading_post',
          gemini: 'trading_post_gemini',
          manus: 'trading_post_manus',
          meta: 'trading_post_meta'
        };
        const prefix = prefixMap[engineAttempt] || 'trading_post';
        latestImgPath = getLatestGeneratedImage(prefix);
        
        if (latestImgPath && fs.existsSync(path.join(ROOT, latestImgPath))) {
          const stats = fs.statSync(path.join(ROOT, latestImgPath));
          const fileAgeMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
          
          // Considerar fresca si se generó en los últimos 20 minutos
          if (fileAgeMinutes < 20) {
            console.log(`✅ Imagen localizada y verificada para publicación: ${latestImgPath} (${engineAttempt.toUpperCase()})`);
            activeEngine = engineAttempt;
            executionSuccess = true;
            
            // --- SINCRONIZACIÓN INTELIGENTE CON LA BÓVEDA ---
            try {
              const feedPath = path.join(ROOT, '.agent', 'local_portal_feed.json');
              if (fs.existsSync(feedPath)) {
                const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
                const engineUserId = `local_ai_agent_${engineAttempt}`;
                const latestFeedEntry = feed.find(entry => entry.userId === engineUserId || (engineAttempt === 'chatgpt' && entry.userId === 'local_ai_agent_chatgpt'));
                
                if (latestFeedEntry) {
                  const caption = latestFeedEntry.caption || '';
                  const lines = caption.split('\n');
                  const frase = latestFeedEntry.title || lines[0] || 'Estrategia TradeShare';
                  const copy = lines.slice(1).join('\n').trim() || caption;
                  
                  let vault = [];
                  if (fs.existsSync(VAULT_PATH)) {
                    vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
                  }
                  
                  const relativeImg = `/generated_posts/${path.basename(latestImgPath)}`;
                  const alreadyExists = vault.some(v => v.imagenUrl === relativeImg);
                  
                  if (!alreadyExists) {
                    const vaultEntry = {
                      id: `vault_${Date.now()}`,
                      date: new Date().toISOString().split('T')[0],
                      timestamp: Date.now(),
                      frase: frase.replace(/[🌟🚀📊🧠💎📈]/g, '').trim(),
                      copy: copy,
                      imagenUrl: relativeImg,
                      communitySlug: 'forex-traders-hub',
                      communityPostUrl: `http://localhost:3000/comunidad/forex-traders-hub`,
                      instagramFeedUrl: null,
                      instagramStoryPosted: false
                    };
                    
                    vault.unshift(vaultEntry);
                    fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2), 'utf8');
                    console.log(`💾 [SINCRONIZACIÓN] Guardado post exitoso de ${engineAttempt.toUpperCase()} en marketing_vault.json!`);
                  }
                }
              }
            } catch (syncErr) {
              console.error(`⚠️ Error al sincronizar feed con bóveda: ${syncErr.message}`);
            }
            break; // ¡Éxito! Salimos del bucle
          } else {
            console.log(`⚠️ Imagen localizada (${latestImgPath}) es antigua (creada hace ${Math.round(fileAgeMinutes)} minutos). Probando siguiente motor...`);
          }
        }
      }
      console.log(`❌ Generador ${engineAttempt.toUpperCase()} falló o no generó imagen fresca.`);
    }
  }

  // Fallback definitivo si fallan absolutamente todos los generadores de IA
  if (!executionSuccess) {
    console.log(`🛟 [FALLBACK DE SEGURIDAD] Todos los motores de IA fallaron. Usando contingencia local de sectores...`);
    const fallback = runLocalFallbackGenerator(state.engine);
    latestImgPath = fallback.imagePath;
    executionSuccess = true; // El fallback siempre tiene éxito
  }

  // PUBLICACIÓN MULTIPLATAFORMA (INSTAGRAM, THREADS, FACEBOOK)
  if (latestImgPath && !generateOnly) {
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
