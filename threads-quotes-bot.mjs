/**
 * threads-quotes-bot.mjs
 * ══════════════════════════════════════════════════════════
 * Publicador Rotativo de Frases en Threads (Cada 2 horas)
 *
 * Flujo:
 *   1. Cargar las 50 frases comerciales/motivacionales provistas.
 *   2. Cargar/inicializar estado en .agent/threads_quotes_state.json.
 *   3. Conectar a Playwriter (CDP puerto 19988).
 *   4. Publicar la frase actual rotativamente.
 *   5. Actualizar el índice de frase para la próxima vuelta.
 *   6. Dormir 2 horas (7200000 ms) y repetir indefinidamente (PM2 Daemon).
 *
 * Uso:
 *   node threads-quotes-bot.mjs            # Modo Daemon (Publica al iniciar, luego cada 2 horas)
 *   node threads-quotes-bot.mjs --test     # Publica una frase de prueba inmediatamente y termina
 *
 * ══════════════════════════════════════════════════════════
 */

import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import path from 'path';
import fs from 'fs';
import { 
  addPostCreated, 
  hasPostedContent, 
  isWithinHumanHours 
} from './utils/social-db.mjs';

const PROJECT_ROOT = process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, '.agent', 'threads_quotes_state.json');

// ── Lista de 100 frases comerciales de captación y trading ──
const MARKETING_QUOTES = [
  "Telegram para hablar.\nTradeShare para construir un negocio de trading real.",
  "Tu comunidad merece más que señales perdidas en Telegram.",
  "Si tenés una comunidad trader, necesitás infraestructura.\nNo más parches.",
  "Discord organiza chats.\nTradeShare organiza traders. 📈",
  "El futuro del trading no vive en grupos de Telegram.\nVive en ecosistemas.",
  "Menos humo.\nMás track record.\nMás automatización.",
  "¿Seguís manejando tu comunidad trader como en 2020? 👀",
  "Traders serios necesitan herramientas serias.",
  "Tu comunidad no necesita otro canal.\nNecesita evolución. 🚀",
  "Telegram no fue creado para escalar comunidades de trading.\nTradeShare sí.",
  "Convertí tu comunidad en un ecosistema profesional.",
  "Dejá de vender humo.\nMostrá resultados reales. 📊",
  "Si tenés traders siguiéndote, necesitás algo más grande que Discord.",
  "Las comunidades de trading están evolucionando.\n¿La tuya también?",
  "Todo trader quiere lo mismo:\nherramientas, comunidad y resultados.",
  "El mercado cambió.\nTu comunidad también tiene que hacerlo.",
  "Automatización + comunidad + trading.\nEso es el futuro. 🚀",
  "No construyas una comunidad sobre herramientas limitadas.",
  "Los traders ya no creen en capturas.\nQuieren métricas reales. 📈",
  "Tu Discord puede hablar de trading.\nTradeShare puede vivir del trading.",
  "La próxima generación de comunidades traders ya llegó.",
  "Si tu comunidad depende de copiar y pegar señales… hay un problema.",
  "Construí autoridad con resultados, no con marketing.",
  "No más grupos fantasmas.\nConstruí comunidad real.",
  "El trading necesita transparencia.\nY eso empieza por la comunidad.",
  "Telegram fue el comienzo.\nTradeShare es el siguiente nivel. 🚀",
  "Las comunidades traders merecen algo mejor que chats infinitos.",
  "Tu comunidad puede ser mucho más que señales y emojis.",
  "Traders creando comunidades para traders.\nAsí debería ser siempre.",
  "Si sos creador de contenido trader, esto es para vos. 📈",
  "Todo lo que buscás para tu comunidad trader, en un solo lugar.",
  "El trading social necesita evolucionar.",
  "Menos capturas.\nMás auditoría real. 📊",
  "Crear una comunidad trader seria no debería ser un caos.",
  "Señales hay miles.\nComunidades sólidas, pocas.",
  "Los traders inteligentes construyen ecosistemas.",
  "Tu comunidad necesita más tecnología.\nY menos improvisación.",
  "El problema no es conseguir traders.\nEs retenerlos.",
  "No dependas de plataformas hechas para gaming o mensajería.",
  "Construí una comunidad trader profesional desde el día uno.",
  "El trading necesita comunidad.\nBut comunidad inteligente.",
  "Dejá de administrar chats.\nEmpezá a construir marca. 🚀",
  "Tu conocimiento vale más que un canal de Telegram.",
  "Una comunidad trader bien hecha puede cambiar todo.",
  "Si operás en serio, necesitás una plataforma seria.",
  "Discord sirve para comunidades gamer.\nTradeShare para traders. 📈",
  "Los traders ya no quieren promesas.\nQuieren estructura.",
  "Comunidad. Automatización. Monetización.\nTodo conectado.",
  "Tu comunidad trader puede convertirse en una empresa real.",
  "El futuro del trading social ya empezó.\nY no está en Telegram. 🚀",
  "El mercado no destruye cuentas. La falta de disciplina sí.",
  "Entrar por impulso es pagar matrícula al mercado.",
  "Tu estrategia puede ser rentable y aun así perder operaciones.",
  "El trader emocional siempre llega tarde al movimiento.",
  "Operar sin stop loss es negociar contra tu propio futuro.",
  "La sobreoperación nace de la ansiedad, no de la oportunidad.",
  "El miedo te hace cerrar ganancias demasiado pronto.",
  "La avaricia te hace mantener pérdidas demasiado tiempo.",
  "El mercado recompensa la paciencia, no la desesperación.",
  "No necesitas operar todos los días para ser rentable.",
  "Una sola operación no define tu carrera como trader.",
  "El capital es munición. Protégelo antes de multiplicarlo.",
  "El trader amateur busca adrenalina. El profesional busca consistencia.",
  "El problema no es perder. El problema es no gestionar el riesgo.",
  "Si tu plan cambia en medio de la operación, nunca hubo plan.",
  "El mercado siempre castiga la improvisación.",
  "Las emociones fuertes son enemigas de las buenas decisiones.",
  "La paciencia también es una posición.",
  "El mejor trade muchas veces es no entrar.",
  "Un trader disciplinado sobrevive donde otros desaparecen.",
  "Las pérdidas pequeñas son parte del negocio. Las pérdidas gigantes son ego.",
  "El FOMO convierte oportunidades en errores.",
  "Quien persigue velas termina persiguiendo pérdidas.",
  "El mercado premia la ejecución, no las excusas.",
  "Operar cansado es operar en desventaja.",
  "El exceso de confianza destruye más cuentas que la ignorancia.",
  "Sin gestión emocional no existe estrategia ganadora.",
  "El trader rentable piensa en probabilidades, no en certezas.",
  "Cada operación debe tener una razón lógica, no emocional.",
  "El dinero rápido suele salir aún más rápido.",
  "El secreto no está en ganar siempre, sino en perder poco.",
  "Tu mayor competencia no son otros traders. Eres tú mismo.",
  "El mercado prueba tu paciencia antes de recompensarla.",
  "Las reglas simples ejecutadas con disciplina generan resultados extraordinarios.",
  "El trader impulsivo busca venganza. El trader profesional busca claridad.",
  "La consistencia nace de repetir correctamente el mismo proceso.",
  "No operes para sentir emoción. Opera para construir libertad.",
  "La verdadera ventaja está en el control emocional.",
  "El mercado no tiene memoria de tu última pérdida.",
  "El riesgo mal calculado puede borrar meses de trabajo.",
  "Operar sin estadísticas es apostar disfrazado de trading.",
  "Las mejores decisiones suelen sentirse aburridas.",
  "Tu diario de trading revela errores que tu ego intenta ocultar.",
  "La paciencia convierte oportunidades pequeñas en resultados enormes.",
  "Cada operación debe respetar tu gestión de riesgo sin excepción.",
  "El trader exitoso domina primero su mente y después el mercado.",
  "La consistencia vale más que una ganancia explosiva.",
  "Las cuentas fondeadas se consiguen con disciplina, no con suerte.",
  "El mercado siempre estará mañana. Tu capital debe estar también.",
  "El verdadero poder en trading está en controlar lo que puedes perder."
];

function log(msg, type = 'INFO') {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${ts}] [THREADS-QUOTES] [${type}] ${msg}`);
}

// ── Cargar / Guardar Estado ──
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      return data.nextIndex !== undefined ? data.nextIndex : 0;
    }
  } catch (e) {
    log(`⚠️ No se pudo leer archivo de estado, iniciando en 0: ${e.message}`, 'WARN');
  }
  return 0;
}

function saveState(nextIndex) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ nextIndex, updatedAt: new Date().toISOString() }, null, 2));
  } catch (e) {
    log(`⚠️ No se pudo guardar el estado de frases: ${e.message}`, 'WARN');
  }
}

// ── Publicar en Threads via Playwriter ──
async function publishQuote(text) {
  log(`🚀 Conectando a Playwriter para publicar Quote...`);
  
  let browser;
  let context;
  let page;

  try {
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    context = browser.contexts()[0];
    
    // Cerrar proactivamente pestañas anteriores de Threads para no saturar el sistema
    try {
      const pages = context.pages();
      for (const p of pages) {
        const url = p.url();
        if (url.includes('threads.net') || url === 'about:blank' || url === '') {
          log(`🧹 Cerrando pestaña previa inactiva de Threads: ${url}`);
          await p.close().catch(() => {});
        }
      }
    } catch (err) {
      log(`⚠️ No se pudieron limpiar las pestañas anteriores: ${err.message}`, "WARN");
    }

    // Abrir nueva pestaña para la publicación
    page = await context.newPage();

    log('🌐 Navegando a Threads.net...');
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000);

    // Verificar login
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    if (bodyText.includes('Log in') || bodyText.includes('Iniciar sesión') || bodyText.includes('Sign up')) {
      log('❌ No hay sesión activa en Threads. Por favor logueate en tu navegador Chrome real.', 'ERROR');
      await page.close();
      return false;
    }

    log('📝 Abriendo modal de nueva publicación...');
    // 1. Clic en el botón "Nuevo hilo" / "New thread" del sidebar usando evaluate para evitar superposiciones
    const clickedNewThread = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('svg'));
      const newThreadSvg = svgs.find(s => {
        const label = (s.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('nuevo hilo') || label.includes('new thread');
      });
      
      if (newThreadSvg) {
        const button = newThreadSvg.closest('[role="button"]') || newThreadSvg.parentElement;
        if (button) {
          button.click();
          return true;
        }
      }
      
      const divs = Array.from(document.querySelectorAll('div[role="button"]'));
      const newThreadDiv = divs.find(d => {
        const t = (d.innerText || '').toLowerCase();
        return t.includes('nuevo hilo') || t.includes('new thread');
      });
      
      if (newThreadDiv) {
        newThreadDiv.click();
        return true;
      }
      
      return false;
    });

    if (!clickedNewThread) {
      log('⚠️ Botón de "Nuevo hilo" en sidebar no encontrado por evaluate. Usando fallback de click nativo del feed...', 'WARN');
      await page.click('div[contenteditable], div[placeholder], [placeholder*="novedades"], [placeholder*="hilo"]').catch(() => {});
    }
    await page.waitForTimeout(2000);

    // 2. Esperar que el modal de nuevo hilo esté visible
    await page.waitForSelector('div[role="dialog"]', { timeout: 12000 });
    await page.waitForTimeout(500);

    // 3. Escribir el texto en el campo correcto dentro del modal (Selectores exactos de threads-publisher.mjs)
    const inputSelectors = [
      'div[role="dialog"] div[contenteditable="true"]',
      'div[role="dialog"] textarea',
      'div[role="dialog"] [data-lexical-editor="true"]',
      'div[contenteditable="true"]',
    ];

    let inputField = null;
    for (const sel of inputSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          inputField = el;
          break;
        }
      } catch (e) { continue; }
    }

    if (!inputField) {
      log('❌ No se pudo localizar el campo de texto dentro del modal de Threads.', 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-quote-no-editor-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    // Click en el campo y escribir con delay de tipeo humano
    await inputField.click({ force: true });
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    await page.keyboard.type(text, { delay: 25 });
    log(`⌨️ Frase escrita (${text.length} caracteres).`);
    await page.waitForTimeout(2000);

    // 4. Buscar y hacer clic en el botón "Publicar" dentro del modal
    const publishButtonSelectors = [
      'div[role="dialog"] button:has-text("Publicar")',
      'div[role="dialog"] button:has-text("Post")',
      'div[role="dialog"] div[role="button"]:has-text("Publicar")',
      'button:has-text("Publicar")',
    ];

    let publishButton = null;
    for (const sel of publishButtonSelectors) {
      try {
        const candidate = page.locator(sel).last();
        if (await candidate.isVisible({ timeout: 3000 })) {
          const isDisabled = await candidate.isDisabled();
          const ariaDisabled = await candidate.getAttribute('aria-disabled');
          if (!isDisabled && ariaDisabled !== 'true') {
            publishButton = candidate;
            break;
          }
        }
      } catch (e) { continue; }
    }

    if (publishButton) {
      log('🚀 Haciendo clic nativo en el botón "Publicar"...');
      await publishButton.click({ force: true });
    } else {
      log('⚠️ Botón de publicar no clickeado por locator. Intentando evaluate global...', 'WARN');
      const published = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('[role="dialog"] div[role="button"], [role="dialog"] button'));
        const pubBtn = btns.find(b => {
          const t = (b.innerText || '').toLowerCase().trim();
          return t === 'publicar' || t === 'post' || t === 'compartir';
        });
        if (pubBtn) {
          pubBtn.click();
          return true;
        }
        return false;
      });
      if (!published) {
        log('❌ No se pudo encontrar ni hacer clic en el botón de publicar en la UI.', 'ERROR');
        await page.close();
        return false;
      }
    }

    log('⏳ Esperando confirmación de publicación...');
    await page.waitForTimeout(6000);
    return true;

  } catch (err) {
    log(`❌ Error publicando frase: ${err.message}`, 'ERROR');
    if (page) {
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-quote-error-${Date.now()}.png`) }).catch(() => {});
    }
    return false;
  } finally {
    if (page) {
      log("🧹 Cerrando pestaña de trabajo de Threads...");
      await page.close().catch(() => {});
    }
    if (browser) {
      log("🔌 Desconectando de Playwriter...");
      try {
        if (typeof browser.disconnect === 'function') {
          await browser.disconnect().catch(() => {});
        } else if (typeof browser.close === 'function') {
          await browser.close().catch(() => {});
        }
      } catch (e) {
        log(`⚠️ Error al desconectar el navegador: ${e.message}`, 'WARN');
      }
    }
  }
}

// ── Ejecución Principal ──
const isTestMode = process.argv.includes('--test');

async function start() {
  if (isTestMode) {
    log('🧪 MODO PRUEBA: Iniciando test de publicación...');
    const index = loadState();
    // En modo test elegir aleatorio también para validar flujo real
    let randomIndex = Math.floor(Math.random() * MARKETING_QUOTES.length);
    while (randomIndex === index && MARKETING_QUOTES.length > 1) {
      randomIndex = Math.floor(Math.random() * MARKETING_QUOTES.length);
    }
    const quote = MARKETING_QUOTES[randomIndex];
    log(`[TEST] Frase aleatoria a publicar (Index ${randomIndex}/100): "${quote.replace(/\n/g, ' ')}"`);
    
    const success = await publishQuote(quote);
    if (success) {
      saveState(randomIndex);
      log(`[TEST] ✅ Éxito. Guardado índice: ${randomIndex}. Terminado.`);
      process.exit(0);
    } else {
      log('[TEST] ❌ Falló la publicación. Terminado con error.');
      process.exit(1);
    }
  }

  log('🛡️ MODO DAEMON: Iniciando programador infinito aleatorio cada 2 horas...');
  const INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 horas (7200000 ms)

  while (true) {
    try {
      if (!isWithinHumanHours()) {
        log("😴 Fuera de horario operativo (08:00 - 23:00). Modo sueño activo. Durmiendo 15 minutos...");
        await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
        continue;
      }

      const index = loadState();
      
      // Selección aleatoria robusta de frase no duplicada recientemente
      let randomIndex = Math.floor(Math.random() * MARKETING_QUOTES.length);
      let quote = MARKETING_QUOTES[randomIndex];
      let attempts = 0;
      
      // Intentar buscar una frase que no se haya publicado recientemente en Threads
      while (await hasPostedContent('threads', 'my_profile', quote) && attempts < MARKETING_QUOTES.length) {
        randomIndex = Math.floor(Math.random() * MARKETING_QUOTES.length);
        quote = MARKETING_QUOTES[randomIndex];
        attempts++;
      }

      log(`🔔 Iniciando publicación rotativa aleatoria (Index ${randomIndex}/130, intentos de rotación: ${attempts})...`);
      log(`💬 Frase: "${quote.replace(/\n/g, ' ')}"`);

      const success = await publishQuote(quote);
      if (success) {
        saveState(randomIndex);
        await addPostCreated('threads', 'my_profile', 'my_profile', quote);
        log(`✅ Publicada. Índice guardado: ${randomIndex}.`);
      } else {
        log('⚠️ Error al publicar. Reintentaremos en el próximo ciclo.', 'WARN');
      }

      log(`😴 Entrando en modo de espera de 2 horas...`);
      await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    } catch (e) {
      log(`❌ Error en loop de Threads: ${e.message}`, 'ERROR');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
}

start().catch(e => {
  console.error('💥 Error crítico en start():', e);
  process.exit(1);
});
export { MARKETING_QUOTES };
