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

// ── Lista de Hilos de Debate, Análisis Técnico y Captación Orgánica ──
const MARKETING_QUOTES = [
  // Debates Técnicos y Acción del Precio
  "Debate para traders de futuros e índices:\n¿Prefieren operar el rompimiento de sesión (Asian Range Breakout) o esperar el barrido de liquidez y entrar en el retroceso?\nEn el Nasdaq, el 70% de las roturas de las 9:30 AM son manipulaciones que cazan stops antes del movimiento real.\n¿Cómo lo filtran ustedes? Los leo abajo 👇",
  
  "Indicadores tradicionales vs Acción del Precio pura:\nEl RSI y las EMAs calculan promedios del pasado; en tendencias con fuerte volumen institucional suelen quedarse sobrecomprados días enteros.\nLa vela, el volumen y los Order Blocks muestran la absorción en vivo.\n¿Tienen el gráfico completamente limpio o usan algún indicador de apoyo para confluencias?",
  
  "El gran dilema del trader:\n¿Mover a Break Even rápido en 1:1 o dejar correr la posición hasta el Stop Loss / Take Profit original?\nMuchos protegen demasiado rápido por miedo a perder y terminan saliendo por spread justo antes de que el mercado vuele a su favor.\n¿Cómo lo manejan en su operativa?",
  
  "Regla matemática de cuentas de fondeo que casi nadie respeta:\nSi tu pérdida máxima diaria es del 4%, tu riesgo por trade NO puede superar el 0.75%.\nCon 2 trades negativos seguidos en la misma sesión ya estás al borde de quemar la cuenta si arriesgas el 2%.\nEl daily drawdown se defiende con matemática, no con esperanza.\n¿Cuánto arriesgan por posición en evaluaciones?",
  
  "¿Por qué tantos traders queman sus cuentas en la sesión asiática?\nPorque operan en rangos de baja liquidez y alta consolidación.\nLos movimientos de verdadera expansión ocurren en la Killzone de Londres y en la apertura de Nueva York.\nConcentrar tu energía en esas 2 horas vale más que pasar 8 horas pegado al monitor.\n¿Qué sesión operan principalmente?",
  
  "La diferencia entre un trader amateur y un profesional no es que el profesional nunca pierde:\nEs cómo reacciona tras 3 stop loss seguidos en un día.\nEl amateur entra en venganza, duplica lotaje y quema la cuenta en 30 minutos.\nEl profesional apaga la pantalla, anota los trades en su bitácora y entiende que fue un costo operativo normal.\n¿Cuál fue el error psicológico que más les costó superar?",
  
  "Escenario técnico en Oro (XAUUSD):\nLlega a zona de oferta en H1, barre el máximo anterior con una mecha rápida de absorción y cierra con cuerpo por debajo.\n¿Entran directo por confirmación de vela o esperan el retesteo al Fair Value Gap en M5?\nLos leo en comentarios 📊",
  
  "La trampa del 90% de winrate:\nUn sistema con 85% de acierto pero ratio 1:0.5 puede quebrar tu cuenta con una sola racha mala.\nUn sistema con 45% de acierto pero ratio 1:3 es una máquina de imprimir consistencia a largo plazo.\nDejen de buscar el santo grial de no perder nunca. Busquen esperanza matemática positiva.",
  
  "¿Operan con Stop Loss técnico detrás del último swing o Stop Loss fijo en puntos/pips?\nEn activos volátiles como el Nasdaq o el Oro, un stop fijo muchas veces queda en medio del ruido del spread institucional.\n¿Cuál les dio mejores resultados estadísticos?",
  
  "Overtrading: la adicción silenciosa del trader minorista.\nSi ya cumpliste tu objetivo del día en los primeros 45 minutos de la sesión de Nueva York, ¿por qué seguir buscando operaciones forzadas?\nEl mercado no se va a ningún lado mañana. Tu capital sí puede esfumarse hoy.\n¿Tienen regla de cierre obligatorio de plataforma?",
  
  // Producto: Bot Gestor
  "¿Sabían cuál es la función que más salva cuentas de fondeo en el Bot Gestor de TradeShare?\nEl bloqueo automático por Drawdown Diario.\nCuando tu cuenta alcanza tu límite de pérdida prefijado, el bot cierra operaciones vivas y desactiva la terminal hasta el día siguiente.\nElimina el revenge trading al 100%. La disciplina que tu mente no tiene en caliente, la ejecuta el código en frío. 🤖🛡️",
  
  "Gestión de trades manual vs automatizada:\nMientras el trader manual duda si mover a Break Even o tomar parciales viendo la vela retroceder, el Bot Gestor de TradeShare ejecuta:\n1. Cierre parcial al 1:1.5 automáticamente.\n2. Trailing Stop ceñido por estructura de mercado.\n3. Asegura ganancias sin titubeos.\nMenos estrés mental, más consistencia técnica. 📈",
  
  // Producto: Indicador de Zonas Institucionales
  "Dejen de trazar 40 líneas que confunden su gráfico.\nEl Indicador de Zonas de TradeShare mapea de forma algorítmica:\n🎯 Bloques de órdenes (Order Blocks) de alta probabilidad\n🎯 Detección de barridos de liquidez institucional (Stop Hunts)\n🎯 Zonas de oferta y demanda en múltiples temporalidades\nTodo limpio, sobrio y directo para tomar decisiones con precisión quirúrgica. 📊",
  
  // Psicotrading y Hábitos de Élite
  "Aceptar el Stop Loss es la habilidad más difícil y más rentable del trading.\nCuando entiendes que el stop loss es el cinturón de seguridad que te mantiene con vida en el mercado, dejas de moverlo por miedo.\nSi el mercado invalidó tu idea, se sale. Punto.",
  
  "Si no llevas una bitácora detallada de cada trade, no estás haciendo trading: estás apostando.\n¿A qué hora entraste? ¿Qué patrón viste? ¿Cómo te sentías al gatillar? ¿Respetaste tu lotaje?\nLas métricas frías no mienten; tu memoria sí.\n¿Registran sus operaciones diariamente?",
  
  "Las cuentas fondeadas no se pasan en 2 días con trades milagrosos.\nSe pasan con paciencia de francotirador: 0.5% por operación, setups A+, esperando la killzone correcta y cuidando el balance como oro en polvo.\nLa consistencia aburrida es la que paga retiros reales mes a mes."
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
    await page.waitForTimeout(800);

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
    await page.waitForTimeout(300);

    // 2. Esperar que el modal de nuevo hilo esté visible
    await page.waitForSelector('div[role="dialog"]', { timeout: 12000 });
    await page.waitForTimeout(100);

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

    // Click en el campo y escribir con delay de tipeo humano ultra-rápido
    await inputField.click({ force: true });
    await page.waitForTimeout(80);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(50);

    await page.keyboard.type(text, { delay: 5 });
    log(`⌨️ Frase escrita (${text.length} caracteres).`);
    await page.waitForTimeout(250);

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
    await page.waitForTimeout(1500);
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
