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
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();

function log(msg, type = 'INFO') {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${ts}] [IG-DM] [${type}] ${msg}`);
}

async function sendIGDM(username, message) {
  if (!username || !message) {
    log('❌ Faltan parámetros: --user y --text son obligatorios.', 'ERROR');
    process.exit(1);
  }

  const cleanUser = username.replace('@', '').trim();
  log(`📨 Preparando DM de Instagram para @${cleanUser}...`);
  log(`📝 Mensaje: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`);

  let browser;
  let context;
  let page;

  // ── Conectar a Playwriter ──
  try {
    log('🔗 Conectando a Playwriter (Puerto 19988)...');
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    context = browser.contexts()[0];
    log('✅ Conectado a Playwriter exitosamente.');
  } catch (e) {
    log(`❌ No se pudo conectar a Playwriter: ${e.message}`, 'ERROR');
    log('👉 Asegurate de que Playwriter esté corriendo en el puerto 19988.', 'ERROR');
    process.exit(1);
  }

  // Abrir nueva pestaña para el DM
  page = await context.newPage();

  try {
    // ── Paso 1: Navegar al Inbox de Instagram ──
    log('🌐 Navegando a Instagram Inbox...');
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000);

    // Intentar cerrar posibles notificaciones flotantes de Instagram
    const notNowSelectors = ['button:has-text("Ahora no")', 'button:has-text("Not Now")', 'button:has-text("Not now")'];
    for (const sel of notNowSelectors) {
      try {
        const btn = page.locator(sel);
        if (await btn.count() > 0 && await btn.isVisible()) {
          await btn.first().click({ timeout: 1000 }).catch(() => {});
          log('📎 Notificaciones flotantes descartadas.');
          await page.waitForTimeout(1000);
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
    await page.waitForTimeout(500);
    await searchInput.fill(cleanUser);
    log(`⌨️ Escribiendo "${cleanUser}" en el campo de búsqueda...`);
    await page.waitForTimeout(3500); // Esperar que cargue el dropdown

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
      const firstRow = document.querySelector('[role="dialog"] [role="button"], div[role="button"]:has-text("coincidentes"), div[role="button"]');
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
    const clickedChatBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[role="dialog"] button, [role="dialog"] div[role="button"]'));
      const chatBtn = btns.find(b => {
        const t = (b.innerText || '').toLowerCase().trim();
        return t.includes('chat') || t.includes('siguiente') || t.includes('next');
      });
      
      if (chatBtn) {
        chatBtn.click();
        return true;
      }
      return false;
    });

    if (clickedChatBtn) {
      log('✅ Clic en botón "Chat" realizado en el modal flotante.');
      await page.waitForTimeout(3000);
    } else {
      log('📎 Conversación abierta directamente. Saltando clic de "Chat" secundario.');
      await page.waitForTimeout(2000);
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
    ];

    let msgBox = null;
    for (const sel of msgSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible()) {
          msgBox = el;
          log(`📎 Campo de mensaje encontrado: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!msgBox) {
      // Fallback por placeholders comunes
      const placeholders = ['Envía un mensaje', 'Send a message', 'Escribe un mensaje', 'Type a message', 'mensaje', 'escribe'];
      for (const ph of placeholders) {
        try {
          const el = page.locator(`[placeholder*="${ph}"]`).first();
          if (await el.count() > 0) {
            msgBox = el;
            log(`📎 Campo encontrado por placeholder: "${ph}"`);
            break;
          }
        } catch {}
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
    await page.waitForTimeout(500);
    await page.keyboard.type(message, { delay: 35 });
    log(`⌨️ Mensaje escrito (${message.length} chars).`);
    await page.waitForTimeout(1000);

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

    await page.waitForTimeout(2500);

    // Confirmación visual
    log(`✅ DM de Instagram enviado exitosamente a @${cleanUser}!`);
    await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-ok-${cleanUser}-${Date.now()}.png`) }).catch(() => {});

    await page.waitForTimeout(1000);
    await page.close();
    return true;

  } catch (err) {
    log(`❌ Error enviando DM a @${cleanUser}: ${err.message}`, 'ERROR');
    await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `ig-dm-error-${cleanUser}-${Date.now()}.png`) }).catch(() => {});
    await page.close().catch(() => {});
    return false;
  } finally {
    if (browser) {
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
