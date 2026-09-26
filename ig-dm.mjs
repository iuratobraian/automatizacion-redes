/**
 * ig-dm.mjs
 * ══════════════════════════════════════════════════════════
 * Envía un DM (mensaje directo) a un usuario de Instagram
 * usando Playwright conectado al navegador real via Playwriter.
 *
 * Flujo:
 *   1. Conectar al browser Playwriter (puerto 19988)
 *   2. Navegar a https://www.instagram.com/direct/inbox/
 *   3. Hacer clic en "Nuevo mensaje" (lápiz/papel)
 *   4. Escribir el username en el campo "Busca..."
 *   5. Seleccionar el usuario del dropdown y presionar "Chat"
 *   6. Escribir el mensaje en el campo "Envía un mensaje..."
 *   7. Enviar con Enter
 *
 * Uso:
 *   node ig-dm.mjs --user=USERNAME --text="MENSAJE"
 *
 * ══════════════════════════════════════════════════════════
 */

import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');

function log(msg, type = 'INFO') {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${ts}] [IG-DM] [${type}] ${msg}`);
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

async function sendIGDM(username, message) {
  if (!username || !message) {
    log('❌ Faltan parámetros: --user y --text son obligatorios.', 'ERROR');
    process.exit(1);
  }

  const cleanUser = username.replace('@', '').trim();
  log(`📨 Preparando DM de Instagram para @${cleanUser}...`);
  log(`📝 Mensaje: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`);

  isPlaywriter = false;

  // Configurar auth session file
  let selectedAccount = "tradeshare.ok";
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.selectedAccount) selectedAccount = config.selectedAccount;
    } catch {}
  }
  const AUTH_FILE = path.join(PROJECT_ROOT, '.agent', `instagram_auth_${selectedAccount}.json`);

  // ── Conectar a Playwriter o local Chromium de respaldo ──
  try {
    log('🔗 Conectando a Playwriter (Puerto 19988)...');
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    context = browser.contexts()[0];
    log('✅ Conectado a Playwriter exitosamente.');

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

    // Abrir nueva pestaña para el DM
    page = await context.newPage();
  } catch (e) {
    log(`⚠️ Conexión a Playwriter falló (${e.message}). Levantando local Chromium...`, "WARN");
    if (!fs.existsSync(AUTH_FILE)) {
      log(`❌ Archivo de autenticación no encontrado: ${AUTH_FILE}`, "ERROR");
      return false;
    }
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
    // ── Paso 1: Navegar al Inbox de Instagram ──
    log('🌐 Navegando a Instagram Inbox...');
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(800);

    // Intentar cerrar posibles notificaciones flotantes de Instagram
    const notNowSelectors = ['button:has-text("Ahora no")', 'button:has-text("Not Now")', 'button:has-text("Not now")'];
    for (const sel of notNowSelectors) {
      try {
        const btn = page.locator(sel);
        if (await btn.count() > 0 && await btn.isVisible()) {
          await btn.first().click({ timeout: 1000 }).catch(() => {});
          log('📎 Notificaciones flotantes descartadas.');
          await page.waitForTimeout(300);
        }
      } catch {}
    }

    // Verificar si estamos logueados
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    if (bodyText.includes('Iniciar sesión') || bodyText.includes('Log in') || bodyText.includes('Sign up')) {
      log('❌ No hay sesión activa de Instagram en el navegador. Por favor logueate primero.', 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-login-error-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    // ── Paso 2: Abrir el diálogo "Nuevo mensaje" ──
    log('✏️ Abriendo modal de nuevo mensaje...');
    const clickedNewMsg = await page.evaluate(() => {
      // Buscar el svg que tenga aria-label de nuevo mensaje
      const svgs = Array.from(document.querySelectorAll('svg'));
      const newMsgSvg = svgs.find(s => {
        const label = (s.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('nuevo mensaje') || label.includes('new message');
      });
      
      if (newMsgSvg) {
        const button = newMsgSvg.closest('[role="button"]') || newMsgSvg.parentElement;
        if (button) {
          button.click();
          return true;
        }
      }
      
      // Fallback por texto del div
      const divs = Array.from(document.querySelectorAll('div[role="button"]'));
      const newMsgDiv = divs.find(d => {
        const t = (d.innerText || '').toLowerCase();
        return t.includes('nuevo mensaje') || t.includes('new message');
      });
      
      if (newMsgDiv) {
        newMsgDiv.click();
        return true;
      }
      
      return false;
    });

    if (!clickedNewMsg) {
      log('⚠️ No se encontró el botón de nuevo mensaje con selectores dinámicos. Usando fallback de navegación directa...', 'WARN');
      await page.goto('https://www.instagram.com/direct/new/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(3000);
    }

    // ── Paso 3: Buscar el campo "Busca..." / "Search..." ──
    log(`🔍 Buscando campo "Para:" para buscar @${cleanUser}...`);
    const searchSelectors = [
      'input[placeholder*="Busca"]',
      'input[placeholder*="Search"]',
      'input[name="queryBox"]',
      'input[type="text"]',
    ];

    let searchInput = null;
    for (const sel of searchSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible()) {
          searchInput = el;
          log(`📎 Campo de búsqueda encontrado: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!searchInput) {
      log('❌ No se encontró el campo de búsqueda de destinatario en el modal.', 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-no-search-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    // Escribir el username
    await searchInput.focus();
    await searchInput.click({ force: true });
    await page.waitForTimeout(100);
    await searchInput.fill(cleanUser);
    log(`⌨️ Escribiendo "${cleanUser}" en el campo de búsqueda...`);
    await page.waitForTimeout(800); // Esperar que cargue el dropdown

    // ── Paso 4: Seleccionar el usuario de los resultados ──
    log(`🎯 Buscando @${cleanUser} en resultados...`);
    const selected = await page.evaluate((uname) => {
      const lower = uname.toLowerCase();
      
      // Buscar elementos de sugerencias en todo el DOM (soportando tanto modal como buscador directo del inbox)
      const elements = Array.from(document.querySelectorAll('span, div'));
      
      // Intentar encontrar un elemento que coincida con el nombre exacto de usuario
      for (const el of elements) {
        if (el.children.length === 0) {
          const t = (el.textContent || '').trim().toLowerCase();
          if (t === lower || t === `@${lower}`) {
            // Clickeamos el elemento para seleccionarlo (esto activa el chat o checkbox)
            // Subir al ancestro clickeable
            let target = el;
            for (let i = 0; i < 6; i++) {
              target = target.parentElement;
              if (!target) break;
              if (target.getAttribute('role') === 'button' || target.tagName === 'A' || target.onclick) {
                target.click();
                return 'clicked-parent';
              }
            }
            el.click();
            return 'clicked-element-directly';
          }
        }
      }
      
      // Fallback: clickear la primera fila de búsqueda encontrada
      const dialog = document.querySelector('[role="dialog"]');
      const scope = dialog || document;
      const buttons = Array.from(scope.querySelectorAll('div[role="button"], [role="button"], button'));
      const firstRow = buttons.find(b => (b.innerText || '').toLowerCase().includes('coincidentes')) || 
                       buttons.find(b => (b.innerText || '').toLowerCase().includes(lower)) || 
                       buttons[0];
      if (firstRow) {
        firstRow.click();
        return 'first-row-fallback';
      }
      
      return null;
    }, cleanUser);

    if (!selected) {
      log(`❌ No se encontró a @${cleanUser} en los resultados.`, 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-user-not-found-${cleanUser}-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    log(`✅ Usuario seleccionado (${selected}). Iniciando conversación...`);
    await page.waitForTimeout(2000);

    // Hacer clic en "Chat" / "Siguiente" para abrir la conversación (Solo necesario si estamos dentro del modal flotante)
    let clickedChatBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[role="dialog"] button, [role="dialog"] div[role="button"], [role="dialog"] [role="link"]'));
      const chatBtn = btns.find(b => {
        const t = (b.innerText || b.textContent || '').toLowerCase().trim();
        return t.includes('chat') || t.includes('chatear') || t.includes('siguiente') || t.includes('next');
      });
      
      if (chatBtn) {
        chatBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedChatBtn) {
      try {
        const chatLocator = page.locator('[role="dialog"] div[role="button"]:has-text("Chat"), [role="dialog"] button:has-text("Chat"), [role="dialog"] button:not([disabled])').last();
        if (await chatLocator.count() > 0 && await chatLocator.isVisible().catch(() => false)) {
          await chatLocator.click();
          clickedChatBtn = true;
          log('✅ Clic en botón "Chat" realizado vía locator.');
        }
      } catch {}
    }

    if (clickedChatBtn) {
      log('✅ Clic en botón "Chat" realizado en el modal flotante.');
      await page.waitForTimeout(2500);
    } else {
      log('📎 Conversación abierta directamente. Saltando clic de "Chat" secundario.');
      await page.waitForTimeout(1500);
    }

    log('⏳ Esperando que cargue la sala de chat...');

    // ── Paso 5: Escribir el mensaje en el chat ──
    log('💬 Buscando campo de mensaje...');
    const msgSelectors = [
      'div[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
      'textarea',
      'div[role="textbox"]',
      'input[placeholder*="mensaje"]',
      'input[placeholder*="message"]',
      '[aria-label*="Mensaje"]',
      '[aria-label*="Message"]'
    ];

    let msgBox = null;
    const msgWaitStart = Date.now();
    while (Date.now() - msgWaitStart < 12000) {
      for (const sel of msgSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
            msgBox = el;
            log(`📎 Campo de mensaje encontrado: ${sel}`);
            break;
          }
        } catch {}
      }
      if (msgBox) break;

      // Fallback por placeholders comunes
      const placeholders = ['Envía un mensaje', 'Send a message', 'Escribe un mensaje', 'Type a message', 'mensaje', 'escribe'];
      for (const ph of placeholders) {
        try {
          const el = page.locator(`[placeholder*="${ph}"]`).first();
          if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
            msgBox = el;
            log(`📎 Campo encontrado por placeholder: "${ph}"`);
            break;
          }
        } catch {}
      }
      if (msgBox) break;

      await page.waitForTimeout(600);
    }

    // Fallback Infalible: si el modal se atascó, navegar directo al perfil del usuario
    if (!msgBox) {
      log(`🔄 Intentando fallback directo: navegando al perfil https://www.instagram.com/${cleanUser}/...`);
      try {
        await page.goto(`https://www.instagram.com/${cleanUser}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);
        
        // Buscar botón "Enviar mensaje" / "Message" en el perfil
        const messageBtn = page.locator('div[role="button"]:has-text("Enviar mensaje"), button:has-text("Enviar mensaje"), div[role="button"]:has-text("Message"), button:has-text("Message")').first();
        if (await messageBtn.count() > 0 && await messageBtn.isVisible().catch(() => false)) {
          log('✅ Botón "Enviar mensaje" encontrado en el perfil. Clickeando...');
          await messageBtn.click();
          await page.waitForTimeout(3000);
          
          for (const sel of msgSelectors) {
            const el = page.locator(sel).first();
            if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
              msgBox = el;
              log(`📎 Campo de mensaje encontrado tras navegación a perfil: ${sel}`);
              break;
            }
          }
        }
      } catch (e) {
        log(`⚠️ Falló navegación a perfil: ${e.message}`);
      }
    }

    if (!msgBox) {
      log('❌ No se encontró el campo de texto de mensaje.', 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-no-msgbox-${cleanUser}-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    // Enfocar y escribir
    await msgBox.focus();
    await msgBox.click({ force: true });
    await page.waitForTimeout(100);
    for (const char of message) {
      if (char === '\n') {
        await page.keyboard.down('Shift');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Shift');
      } else {
        await page.keyboard.type(char);
      }
      await page.waitForTimeout(2 + Math.random() * 5);
    }
    log(`⌨️ Mensaje escrito (${message.length} chars).`);
    await page.waitForTimeout(150);

    // ── Paso 6: Enviar el mensaje ──
    log('📤 Enviando mensaje...');
    
    const sendBtnClicked = await page.evaluate(() => {
      // Buscar botón que diga "Enviar" o "Send"
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const sBtn = btns.find(b => {
        const t = (b.innerText || '').toLowerCase().trim();
        return t === 'enviar' || t === 'send';
      });
      if (sBtn) {
        sBtn.click();
        return true;
      }
      return false;
    });

    if (!sendBtnClicked) {
      log('📤 Usando Enter como fallback para enviar...');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(600);

    // Confirmación visual
    log(`✅ DM de Instagram enviado exitosamente a @${cleanUser}!`);
    await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-ok-${cleanUser}-${Date.now()}.png`) }).catch(() => {});

    await page.waitForTimeout(200);
    return true;

  } catch (err) {
    log(`❌ Error enviando DM a @${cleanUser}: ${err.message}`, 'ERROR');
    if (page) {
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-error-${cleanUser}-${Date.now()}.png`) }).catch(() => {});
    }
    return false;
  } finally {
    if (page) {
      log("🧹 Cerrando pestaña de trabajo de Instagram...");
      await page.close().catch(() => {});
    }
    if (browser) {
      log("🔌 Desconectando de Playwriter / Cerrando navegador...");
      await browser.close().catch(() => {});
    }
  }
}

// ── CLI ──
const args = process.argv.slice(2);
const userArg = args.find(a => a.startsWith('--user='))?.split('=').slice(1).join('=')
             || args.find(a => a.startsWith('--username='))?.split('=').slice(1).join('=');
const textArg = args.find(a => a.startsWith('--text='))?.split('=').slice(1).join('=')
             || args.find(a => a.startsWith('--message='))?.split('=').slice(1).join('=');

if (userArg && textArg) {
  sendIGDM(userArg, textArg)
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('💥 Error fatal:', e.message); process.exit(1); });
} else if (args.length > 0) {
  console.log('Uso: node ig-dm.mjs --user=USERNAME --text="TU MENSAJE"');
  process.exit(1);
}

export { sendIGDM };
