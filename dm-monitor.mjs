import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();
const LEADS_FILE = path.join(PROJECT_ROOT, '.agent', 'leads-db.json');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');

function log(msg, type = 'INFO') {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${ts}] [DM-MONITOR] [${type}] ${msg}`);
}

async function run() {
  log("🕵️‍♂️ Iniciando escaneo de respuestas en bandeja de entrada...");

  if (!fs.existsSync(LEADS_FILE)) {
    log("❌ Archivo de leads no encontrado.", "ERROR");
    process.exit(1);
  }

  // Leer leads de la base de datos
  let leadsDb = { leads: [], b2b_leads: [] };
  try {
    leadsDb = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
  } catch (e) {
    log(`❌ Error leyendo base de datos de leads: ${e.message}`, "ERROR");
    process.exit(1);
  }

  // Coleccionar todos los usernames que tienen estado "DM Enviado" (para vigilarlos)
  const watchedUsers = new Set();
  const allLeads = [...(leadsDb.leads || []), ...(leadsDb.b2b_leads || [])];
  
  allLeads.forEach(l => {
    if (l.status === 'DM Enviado' || l.pipeline_stage === 'DM Enviado') {
      watchedUsers.add(l.username.replace('@', '').toLowerCase().trim());
    }
  });

  if (watchedUsers.size === 0) {
    log("📋 No hay DMs enviados pendientes de respuesta. Nada que vigilar hoy.");
    process.exit(0);
  }

  log(`👀 Monitoreando ${watchedUsers.size} cuentas enviadas: ${[...watchedUsers].join(', ')}`);

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
    process.exit(1);
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
    process.exit(1);
  }

  // Leer leads de la base de datos
  let leadsDb = { leads: [], b2b_leads: [] };
  try {
    leadsDb = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
  } catch (e) {
    log(`❌ Error leyendo base de datos de leads: ${e.message}`, "ERROR");
    process.exit(1);
  }

  // Coleccionar todos los usernames que tienen estado "DM Enviado" (para vigilarlos)
  const watchedUsers = new Set();
  const allLeads = [...(leadsDb.leads || []), ...(leadsDb.b2b_leads || [])];
  
  allLeads.forEach(l => {
    if (l.status === 'DM Enviado' || l.pipeline_stage === 'DM Enviado') {
      watchedUsers.add(l.username.replace('@', '').toLowerCase().trim());
    }
  });

  if (watchedUsers.size === 0) {
    log("📋 No hay DMs enviados pendientes de respuesta. Nada que vigilar hoy.");
    process.exit(0);
  }

  log(`👀 Monitoreando ${watchedUsers.size} cuentas enviadas: ${[...watchedUsers].join(', ')}`);

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
    process.exit(1);
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
    await page.waitForTimeout(5000);

    // Cerrar diálogos / popups si aparecen
    try {
      const dismissBtn = page.locator('button:has-text("Ahora no"), button:has-text("Not Now"), button:has-text("Cancelar")').first();
      if (await dismissBtn.count() > 0 && await dismissBtn.isVisible()) {
        await dismissBtn.click({ timeout: 2000 });
      }
    } catch {}

    // Escanear la lista de chats cargados en el inbox
    log("🔍 Escaneando la lista de conversaciones...");
    const chatItems = await page.$$('div[role="listitem"], a[href*="/direct/t/"]');
    log(`🗣️ Encontradas ${chatItems.length} conversaciones activas en pantalla.`);

    let repliesDetected = 0;

    for (const chat of chatItems) {
      try {
        const textContent = await chat.innerText().catch(() => "");
        if (!textContent) continue;

        // Extraer nombre de usuario de la conversación
        // Generalmente es la primera o segunda línea del texto del listitem
        const lines = textContent.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
        const chatUser = lines[0]?.replace('@', '');

        if (chatUser && watchedUsers.has(chatUser)) {
          log(`🎯 Match detectado con cuenta vigilada: @${chatUser}`);

          // Comprobar si el chat tiene indicadores de no leído o respuesta del lead
          // En Instagram Web Mobile, si el chat tiene un badge circular azul o el texto está en negrita,
          // significa que el último mensaje es de ellos y no ha sido respondido por nosotros.
          const isUnread = await chat.$('span[aria-label*="no leído"], span[aria-label*="unread"], div[style*="background-color: rgb(0, 149, 246)"]').catch(() => null);
          
          let lastMsgIsThem = false;
          if (isUnread) {
            lastMsgIsThem = true;
            log(`🟢 Chat no leído detectado para @${chatUser}.`);
          } else {
            // Abrir el chat para verificar el remitente del último mensaje
            log(`💬 Abriendo chat de @${chatUser} para verificar último mensaje...`);
            await chat.click({ force: true });
            await page.waitForTimeout(3000);

            // Evaluar los bloques de mensajes en el chat
            lastMsgIsThem = await page.evaluate(() => {
              // Buscar todos los globos de mensajes en el chat activo
              // En Instagram direct, los mensajes entrantes y salientes se diferencian por el contenedor o alineación.
              // Los mensajes salientes (nuestros) suelen tener clases o estilos que los alinean a la derecha (ej. justifyContent: flex-end).
              // Los entrantes (de ellos) se alinean a la izquierda (ej. justifyContent: flex-start) o tienen fondo gris.
              const msgs = [...document.querySelectorAll('div[role="row"], div[style*="justify-content"]')];
              if (msgs.length === 0) return false;
              
              const lastMsg = msgs[msgs.length - 1];
              const style = window.getComputedStyle(lastMsg);
              const justify = style.justifyContent || style.alignItems || "";
              
              // Si está justificado a la izquierda o tiene fondo de mensaje entrante
              // (en el fallback asumiremos que si no es flex-end/end/right, es de ellos)
              return !justify.includes('flex-end') && !justify.includes('end') && !justify.includes('right');
            });

            // Volver al inbox
            await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
          }

          if (lastMsgIsThem) {
            log(`🎉 ¡Confirmado! @${chatUser} ha respondido el DM.`);
            repliesDetected++;

            // Actualizar estado del lead en la base de datos local
            let updated = false;

            // 1. Buscar en b2b_leads
            if (leadsDb.b2b_leads) {
              const leadObj = leadsDb.b2b_leads.find(l => l.username.toLowerCase().replace('@', '') === chatUser);
              if (leadObj) {
                leadObj.status = "Respondió";
                leadObj.pipeline_stage = "Respondió";
                leadObj.notes = (leadObj.notes || "") + `\n🟢 Respuesta detectada el ${new Date().toLocaleDateString()}`;
                leadObj.updatedAt = new Date().toISOString();
                updated = true;
              }
            }

            // 2. Buscar en leads comunes
            if (!updated && leadsDb.leads) {
              const leadObj = leadsDb.leads.find(l => l.username.toLowerCase().replace('@', '') === chatUser);
              if (leadObj) {
                leadObj.status = "Respondió";
                leadObj.notes += `\n🟢 Respuesta detectada el ${new Date().toLocaleDateString()}`;
                leadObj.updatedAt = new Date().toISOString();
                updated = true;
              }
            }
          } else {
            log(`⏭️ Último mensaje con @${chatUser} fue enviado por nosotros. Esperando respuesta...`);
          }
        }
      } catch (chatErr) {
        log(`⚠️ Error procesando chat individual: ${chatErr.message}`, "WARN");
      }
    }

    if (repliesDetected > 0) {
      fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsDb, null, 2), 'utf-8');
      log(`💾 Base de datos de leads guardada. ${repliesDetected} respuestas actualizadas a "Respondió".`);
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

run();
