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

const PROJECT_ROOT = process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, '.agent', 'threads_quotes_state.json');

// ── Lista de 50 frases comerciales de captación ──
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
  "El trading necesita comunidad.\nPero comunidad inteligente.",
  "Dejá de administrar chats.\nEmpezá a construir marca. 🚀",
  "Tu conocimiento vale más que un canal de Telegram.",
  "Una comunidad trader bien hecha puede cambiar todo.",
  "Si operás en serio, necesitás una plataforma seria.",
  "Discord sirve para comunidades gamer.\nTradeShare para traders. 📈",
  "Los traders ya no quieren promesas.\nQuieren estructura.",
  "Comunidad. Automatización. Monetización.\nTodo conectado.",
  "Tu comunidad trader puede convertirse en una empresa real.",
  "El futuro del trading social ya empezó.\nY no está en Telegram. 🚀"
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
    
    // Buscar pestaña de Threads existente o abrir una nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('threads.net'));
    if (!page) {
      page = await context.newPage();
    }
  } catch (e) {
    log(`❌ Error al conectar con Playwriter: ${e.message}`, 'ERROR');
    return false;
  }

  try {
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

    log('✅ Publicación realizada exitosamente en Threads!');
    await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-quote-ok-${Date.now()}.png`) }).catch(() => {});
    
    await page.close();
    return true;

  } catch (err) {
    log(`❌ Error publicando frase: ${err.message}`, 'ERROR');
    if (page) {
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-quote-error-${Date.now()}.png`) }).catch(() => {});
      await page.close().catch(() => {});
    }
    return false;
  } finally {
    if (browser) {
      log("🔌 Desconectando de Playwriter...");
      await browser.disconnect().catch(() => {});
    }
  }
}

// ── Ejecución Principal ──
const isTestMode = process.argv.includes('--test');

async function start() {
  if (isTestMode) {
    log('🧪 MODO PRUEBA: Iniciando test de publicación...');
    const index = loadState();
    const quote = MARKETING_QUOTES[index];
    log(`[TEST] Frase a publicar (Index ${index}): "${quote.replace(/\n/g, ' ')}"`);
    
    const success = await publishQuote(quote);
    if (success) {
      const nextIndex = (index + 1) % MARKETING_QUOTES.length;
      saveState(nextIndex);
      log(`[TEST] ✅ Éxito. Próximo índice: ${nextIndex}. Terminado.`);
      process.exit(0);
    } else {
      log('[TEST] ❌ Falló la publicación. Terminado con error.');
      process.exit(1);
    }
  }

  log('🛡️ MODO DAEMON: Iniciando programador infinito cada 2 horas...');
  const INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 horas (7200000 ms)

  while (true) {
    const index = loadState();
    const quote = MARKETING_QUOTES[index];
    log(`🔔 Iniciando publicación rotativa (Index ${index}/50)...`);
    log(`💬 Frase: "${quote.replace(/\n/g, ' ')}"`);

    const success = await publishQuote(quote);
    if (success) {
      const nextIndex = (index + 1) % MARKETING_QUOTES.length;
      saveState(nextIndex);
      log(`✅ Publicada. Próxima frase índice: ${nextIndex}.`);
    } else {
      log('⚠️ Error al publicar. Reintentaremos en el próximo ciclo.', 'WARN');
    }

    log(`😴 Entrando en modo de espera de 2 horas...`);
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }
}

start().catch(e => {
  console.error('💥 Error crítico en start():', e);
  process.exit(1);
});
export { MARKETING_QUOTES };
