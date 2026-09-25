import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { isWithinHumanHours } from './utils/social-db.mjs';

const PROJECT_ROOT = process.cwd();
const LEADS_FILE = path.join(PROJECT_ROOT, '.agent', 'leads-db.json');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');

function log(msg, type = 'INFO') {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${ts}] [DM-MONITOR] [${type}] ${msg}`);
}

let browser;
let page;
let context;
let isPlaywriter = false;

// Manejo de señales de parada para cerrar ventanas de inmediato
const cleanUpAndExit = async (signal) => {
  log(`⚠️ Señal ${signal} recibida. Forzando cierre de pestañas y navegador...`, "WARN");
  try {
    if (page && typeof page.close === 'function') {
      await page.close().catch(() => {});
    }
  } catch (e) {}
  try {
    if (browser && typeof browser.close === 'function') {
      await browser.close().catch(() => {});
    }
  } catch (e) {}
  log("🏁 Recursos liberados. Saliendo del proceso.");
  process.exit(signal ? 0 : 1);
};

process.on('SIGINT', () => cleanUpAndExit('SIGINT'));
process.on('SIGTERM', () => cleanUpAndExit('SIGTERM'));

async function run() {
  log("🕵️‍♂️ Iniciando escaneo de respuestas en bandeja de entrada...");

  if (!fs.existsSync(LEADS_FILE)) {
    log("❌ Archivo de leads no encontrado.", "ERROR");
    return;
  }

  // Leer leads de la base de datos
  let leadsDb = { leads: [], b2b_leads: [] };
  try {
    leadsDb = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
  } catch (e) {
    log(`❌ Error leyendo base de datos de leads: ${e.message}`, "ERROR");
    return;
  }

  // Cargar lista de DMs ya procesados para no responder dos veces
  const PROCESSED_PATH = path.join(PROJECT_ROOT, '.agent', 'processed_interactions.json');
  let processedDMs = {};
  try {
    if (fs.existsSync(PROCESSED_PATH)) {
      processedDMs = JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf-8'));
    }
  } catch {}

  // Coleccionar los usernames vigilados (DM enviado) para priorizar respuestas
  const watchedUsers = new Set();
  const allLeads = [...(leadsDb.leads || []), ...(leadsDb.b2b_leads || [])];
  allLeads.forEach(l => {
    if (l.status === 'DM Enviado' || l.pipeline_stage === 'DM Enviado') {
      watchedUsers.add(l.username.replace('@', '').toLowerCase().trim());
    }
  });

  log(`👀 Monitoreando inbox completo. Cuentas prioritarias (DM enviado): ${watchedUsers.size}`);

  // Configurar auth session file
  let selectedAccount = "tradeshare.ok";
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.selectedAccount) selectedAccount = config.selectedAccount;
    } catch {}
  }
  const AUTH_FILE = path.join(PROJECT_ROOT, '.agent', `instagram_auth_${selectedAccount}.json`);

  if (!fs.existsSync(AUTH_FILE)) {
    log(`❌ Archivo de autenticación no encontrado: ${AUTH_FILE}`, "ERROR");
    return;
  }

  // 1. Conectar a Playwriter o local Chromium de respaldo
  try {
    log("🔗 Conectando a Playwriter (CDP Puerto 19988)...");
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    log("✅ Conectado a Playwriter.");
    context = browser.contexts()[0];

    // Cerrar proactivamente pestañas anteriores de Instagram para no saturar el sistema
    try {
      const pages = context.pages();
      for (const p of pages) {
        const url = p.url();
        if (url.includes('instagram.com') || url === 'about:blank' || url === '') {
          log(`🧹 Cerrando pestaña previa inactiva de Instagram: ${url}`);
          await p.close().catch(() => {});
        }
      }
    } catch (err) {
      log(`⚠️ No se pudieron limpiar las pestañas anteriores: ${err.message}`, "WARN");
    }

    page = await context.newPage();
  } catch (e) {
    log(`⚠️ Conexión a Playwriter falló (${e.message}). Levantando local Chromium...`, "WARN");
    browser = await localChromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    context = await browser.newContext({
      storageState: AUTH_FILE,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      locale: "es-AR"
    });
    page = await context.newPage();
  }

  try {
    log("🌐 Navegando a la bandeja de entrada direct de Instagram...");
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1000);

    // Cerrar diálogos / popups si aparecen
    try {
      const dismissBtn = page.locator('button:has-text("Ahora no"), button:has-text("Not Now"), button:has-text("Cancelar")').first();
      if (await dismissBtn.count() > 0 && await dismissBtn.isVisible()) {
        await dismissBtn.click({ timeout: 2000 });
      }
    } catch {}

    // Escanear la lista de chats cargados en el inbox
    log("🔍 Escaneando la lista de conversaciones...");
    
    // Esperar a que la lista de chats cargue
    await page.waitForTimeout(600);
    
    // Extraer TODOS los chats del inbox — estrategia múltiple para compatibilidad con el DOM variable de IG
    const chatData = await page.evaluate(() => {
      const results = [];
      
      // Estrategia 1: Links directos a conversaciones individuales
      let links = [...document.querySelectorAll('a[href*="/direct/t/"]')];
      
      // Estrategia 2: Si no hay links, buscar en todos los elementos con href /direct/
      if (links.length === 0) {
        links = [...document.querySelectorAll('[href*="/direct/"]')].filter(el => el.href?.match(/\/direct\/t\/\d+/));
      }
      
      // Estrategia 3: Buscar por rol de listitem (layout desktop)
      if (links.length === 0) {
        const listitems = [...document.querySelectorAll('[role="listitem"]')];
        for (const item of listitems) {
          const a = item.querySelector('a');
          if (a) links.push(a);
        }
      }
      
      // Estrategia 4: Fallback — cualquier div/li que tenga texto parecido a un chat
      if (links.length === 0) {
        // Intentar encontrar la lista de chats buscando contenedores con tiempo relativo
        const allDivs = [...document.querySelectorAll('div[style], li, section > div > div > div')];
        for (const d of allDivs) {
          const text = (d.innerText || '').trim();
          if (text.includes('min') || text.includes('hora') || text.includes('día') || text.includes('año')) {
            // Probablemente es un ítem de chat
            const a = d.closest('a') || d.querySelector('a');
            if (a && a.href?.includes('/direct/')) links.push(a);
          }
        }
      }
      
      // Desduplicar por href
      const seenHrefs = new Set();
      for (const el of links.slice(0, 25)) {
        try {
          const href = el.href || el.getAttribute('href') || '';
          if (!href || seenHrefs.has(href)) continue;
          seenHrefs.add(href);
          
          const threadId = (href.match(/\/direct\/t\/(\d+)/) || [])[1] || '';
          
          // Buscar en el padre del link para capturar todo el ítem del chat
          const container = el.closest('[role="listitem"]') || el.parentElement?.parentElement || el.parentElement || el;
          
          // Intentar extraer el nombre real del usuario desde spans específicos
          // En IG el nombre suele estar en el PRIMER span con texto significativo
          let username = '';
          const spans = [...(container.querySelectorAll('span') || [])];
          for (const span of spans) {
            const t = (span.textContent || '').trim();
            // El nombre de usuario no tiene espacios (o es poco probable), es corto y no contiene "·" ni tiempos
            if (t && t.length > 1 && t.length < 50 && !t.includes('·') && !t.match(/\d+\s*(min|hora|día|año|seg|h\b)/i) && !t.match(/^(Tú|you|enviaste|sent|te|le):/i)) {
              username = t;
              break;
            }
          }
          
          // Fallback: primer línea del texto completo excluyendo tiempos y previews
          if (!username) {
            const allText = (container.innerText || container.textContent || '').trim();
            const lines = allText.split('\n').map(s => s.trim()).filter(s => s.length > 1 && !s.match(/^\d+\s*(min|hora|día|año|seg)/i));
            username = lines[0] || '';
          }
          
          // Detectar si hay mensaje no leído
          const hasUnreadStyle = container.querySelector('[style*="font-weight: 600"], [style*="font-weight:600"]') !== null;
          const hasUnread = hasUnreadStyle;
          
          if (username && (threadId || href.includes('/direct/'))) {
            results.push({ 
              username: username.replace('@','').toLowerCase().trim(), 
              threadId, 
              href, 
              hasUnread,
              preview: ''
            });
          }
        } catch {}
      }

      return results;
    });

    
    log(`🗣️ Encontradas ${chatData.length} conversaciones activas en pantalla.`);
    if (chatData.length === 0) {
      // Tomar screenshot para diagnóstico
      try { await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', 'dm-inbox-debug.png') }); } catch {}
      log('⚠️ No se encontraron conversaciones. Screenshot guardado en .agent/dm-inbox-debug.png', 'WARN');
    }

    let repliesDetected = 0;

    for (const chatInfo of chatData) {
      try {
        const chatUser = chatInfo.username;
        if (!chatUser) continue;
        
        // Verificar si ya procesamos este chat recientemente (evitar responder dos veces)
        const processedKey = `dm_reply_${chatUser}`;
        const lastProcessed = processedDMs[processedKey];
        const hoursSinceProcessed = lastProcessed ? (Date.now() - new Date(lastProcessed).getTime()) / 3600000 : 999;
        
        // Solo procesar si no lo hemos contestado en las últimas 4 horas
        // Los usuarios de watchedUsers siempre se procesan; los nuevos también
        if (hoursSinceProcessed < 4) {
          log(`⏩ @${chatUser} ya fue respondido hace ${hoursSinceProcessed.toFixed(1)}h. Saltando.`);
          continue;
        }
        
        const isWatched = watchedUsers.has(chatUser);
        const isUnread = chatInfo.hasUnread;
        
        // Responder si: es un usuario vigilado (DM enviado por nosotros) O si hay mensaje no leído
        if (!isWatched && !isUnread) continue;
        
        log(`${isWatched ? '🎯' : '📩'} ${isWatched ? 'Match vigilado' : 'Nuevo DM no leído'}: @${chatUser}`);

        // Abrir el chat
        log(`💬 Abriendo chat de @${chatUser}...`);
        
        // Navegar al thread si tenemos el ID, si no, hacer click en el elemento
        // Navegar al chat usando el ID o la URL completa (más confiable que buscar por texto)
        if (chatInfo.threadId) {
          await page.goto(`https://www.instagram.com/direct/t/${chatInfo.threadId}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else if (chatInfo.href) {
          const fullUrl = chatInfo.href.startsWith('http') ? chatInfo.href : `https://www.instagram.com${chatInfo.href}`;
          await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else {
          log(`⚠️ No se pudo determinar URL del chat de @${chatUser}`, 'WARN');
          continue;
        }
        await page.waitForTimeout(800);


        // Extraer info de último mensaje
        const lastMsgData = await page.evaluate(() => {
          const msgs = [...document.querySelectorAll('div[role="row"], div[style*="justify-content"]')];
          if (msgs.length === 0) return { isThem: false, text: "" };
          
          const lastMsg = msgs[msgs.length - 1];
          const style = window.getComputedStyle(lastMsg);
          const justify = style.justifyContent || style.alignItems || "";
          
          const isThem = !justify.includes('flex-end') && !justify.includes('end') && !justify.includes('right');
          
          let text = "";
          const textContainers = lastMsg.querySelectorAll('span, div[dir="auto"]');
          for (const container of textContainers) {
            const txt = (container.textContent || '').trim();
            if (txt && txt.length > text.length) {
              text = txt;
            }
          }
          if (!text) text = (lastMsg.innerText || '').trim();
          
          return { isThem, text };
        });


        // Responder si el último mensaje es de ellos (nos escribieron)
        if (lastMsgData.isThem && lastMsgData.text) {
          log(`🎉 ¡Confirmado! @${chatUser} escribió: "${lastMsgData.text}"`);
          repliesDetected++;

          // Consultar respuesta a la IA local
          log(`🤖 Generando respuesta IA en español rioplatense...`);
          let replyText = "¡Hola! Qué bueno que te interese TradeShare. Contame, ¿hacés trading hace mucho? 🚀";
          try {
            const prompt = `El cliente @${chatUser} nos envió el siguiente mensaje en Instagram: "${lastMsgData.text}". Gerá una respuesta súper corta (máximo 1-2 oraciones), amigable, en español de Argentina (usando vos/sos). El objetivo es responder amablemente y mantener la conversación de ventas de TradeShare de forma cercana.`;
            const aiRes = await fetch('http://localhost:5680/api/ai/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: prompt })
            });
            if (aiRes.ok) {
              const aiData = await aiRes.json();
              if (aiData.success && aiData.reply) replyText = aiData.reply;
            }
          } catch (aiErr) {
            log(`⚠️ Error generando respuesta con IA: ${aiErr.message}. Usando plantilla fallback.`, 'WARN');
          }

          // Escribir y enviar respuesta
          log(`✍️ Escribiendo respuesta: "${replyText}"`);
          const messageInputSelector = 'div[contenteditable="true"], textarea[placeholder*="Mensaje"], textarea[placeholder*="Message"], textarea';
          const messageInput = page.locator(messageInputSelector).first();
          if (await messageInput.count() > 0 && await messageInput.isVisible()) {
            await messageInput.click({ force: true });
            await page.waitForTimeout(100);
            await messageInput.fill(replyText);
            await page.waitForTimeout(200);
            
            let sent = false;
            const sendBtnSelectors = [
              'button:has-text("Enviar")',
              'button:has-text("Send")',
              'button[aria-label="Enviar"]',
              'button[aria-label="Send"]'
            ];
            for (const sel of sendBtnSelectors) {
              const btn = page.locator(sel).first();
              if (await btn.count() > 0 && await btn.isVisible()) {
                await btn.click({ force: true });
                sent = true;
                break;
              }
            }
            if (!sent) {
              await page.keyboard.press('Enter');
              sent = true;
            }

            if (sent) {
              log(`🚀 Respuesta enviada exitosamente a @${chatUser}.`);
              
              // Guardar en processedDMs para no responder de nuevo en las próximas 4 horas
              processedDMs[`dm_reply_${chatUser}`] = new Date().toISOString();
              try { fs.writeFileSync(PROCESSED_PATH, JSON.stringify(processedDMs, null, 2)); } catch {}
              
              // Actualizar estado del lead en la base de datos local
              let updated = false;
              if (leadsDb.b2b_leads) {
                const leadObj = leadsDb.b2b_leads.find(l => l.username.toLowerCase().replace('@', '') === chatUser);
                if (leadObj) {
                  leadObj.status = "Respondió";
                  leadObj.pipeline_stage = "Respondió";
                  if (!leadObj.messages_sent) leadObj.messages_sent = [];
                  leadObj.messages_sent.push({ message: replyText, sentAt: new Date().toISOString(), isAi: true });
                  leadObj.notes = (leadObj.notes || "") + `\n🟢 Respuesta: "${lastMsgData.text}"\n🤖 IA: "${replyText.substring(0, 45)}..."`, leadObj.updatedAt = new Date().toISOString();
                  updated = true;
                }
              }
              if (!updated && leadsDb.leads) {
                const leadObj = leadsDb.leads.find(l => l.username.toLowerCase().replace('@', '') === chatUser);
                if (leadObj) {
                  leadObj.status = "Respondió";
                  if (!leadObj.messages_sent) leadObj.messages_sent = [];
                  leadObj.messages_sent.push({ message: replyText, sentAt: new Date().toISOString(), isAi: true });
                  leadObj.notes = (leadObj.notes || "") + `\n🟢 Respuesta: "${lastMsgData.text}"\n🤖 IA: "${replyText.substring(0, 45)}..."`, leadObj.updatedAt = new Date().toISOString();
                }
              }
            }
          } else {
            log(`⚠️ No se encontró la caja de mensaje en el chat de @${chatUser}.`);
          }
        } else {
          log(`⏭️ Último mensaje con @${chatUser} fue enviado por nosotros. Esperando respuesta...`);
        }

        // Volver al inbox
        await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(500);
      } catch (chatErr) {
        log(`⚠️ Error procesando chat individual: ${chatErr.message}`, "WARN");
      }
    }

    if (repliesDetected > 0) {
      fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsDb, null, 2), 'utf-8');
      log(`💾 Base de datos de leads guardada. ${repliesDetected} respuestas procesadas.`);
    } else {
      log("✅ Escaneo completado. No se detectaron nuevas respuestas.");
    }

  } catch (err) {
    log(`❌ Error crítico en ejecución del monitor: ${err.message}`, "ERROR");
  } finally {
    if (page) {
      log("🧹 Cerrando pestaña de trabajo de Instagram...");
      await page.close().catch(() => {});
    }
    if (browser) {
      log("🔌 Cerrando conexión CDP...");
      await browser.close().catch(() => {});
    }
    log("🏁 Proceso de vigilancia terminado.");
  }
}

// Escuchas y ejecutor
const isTestMode = process.argv.includes('--test');

async function main() {
  if (isTestMode) {
    log("🧪 MODO TEST: Ejecutando un escaneo de prueba inmediatamente...");
    await run();
    process.exit(0);
  }

  log("🛡️ MODO DAEMON: Iniciando ciclo continuo — escaneo cada 15 minutos...");
  const BASE_INTERVAL = 15 * 60 * 1000; // 15 minutos

  while (true) {
    if (isWithinHumanHours()) {
      try {
        await run();
      } catch (e) {
        log(`Error en ciclo de DM Monitor: ${e.message}`, "ERROR");
      }
    } else {
      log("😴 Fuera del horario operativo (08:00 - 23:00). Modo sueño activo.");
    }

    const jitter = (Math.random() - 0.5) * 2 * 60 * 1000; // ±1 min
    const nextInterval = BASE_INTERVAL + jitter;
    const nextIntervalMin = (nextInterval / 60000).toFixed(1);
    
    log(`⏱️ Próximo escaneo en ${nextIntervalMin} min...`);
    await new Promise(resolve => setTimeout(resolve, nextInterval));
  }
}

main().catch(e => {
  console.error("💥 Error crítico fatal en main():", e);
  process.exit(1);
});
