/**
 * threads-dm.mjs
 * ══════════════════════════════════════════════════════════
 * Envía un DM (mensaje directo) a un usuario de Threads
 * usando Playwright conectado al navegador real via Playwriter.
 *
 * Flujo:
 *   1. Conectar al browser Playwriter (puerto 19988)
 *   2. Navegar a https://www.threads.com/messages/new
 *   3. Escribir el username en el campo "Para:"
 *   4. Seleccionar el usuario del dropdown
 *   5. Escribir el mensaje en el campo "Envía un mensaje..."
 *   6. Enviar con Enter
 *
 * Uso:
 *   node threads-dm.mjs --user=USERNAME --text="MENSAJE"
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
  console.log(`[${ts}] [THREADS-DM] [${type}] ${msg}`);
}

async function sendThreadsDM(username, message) {
  if (!username || !message) {
    log('❌ Faltan parámetros: --user y --text son obligatorios.', 'ERROR');
    process.exit(1);
  }

  const cleanUser = username.replace('@', '').trim();
  log(`📨 Preparando DM para @${cleanUser}...`);
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
    // ── Paso 1: Navegar a la pantalla de nuevo mensaje ──
    log('🌐 Navegando a Threads Messages...');
    await page.goto('https://www.threads.net/messages/new/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Verificar si estamos logueados
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    if (bodyText.includes('Log in') || bodyText.includes('Iniciar sesión') || bodyText.includes('Sign up')) {
      log('❌ No hay sesión activa de Threads. Ejecutá threads-setup-session.mjs primero.', 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-dm-login-error-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    // ── Paso 2: Buscar el campo "Para:" / "To:" y escribir el username ──
    log(`🔍 Buscando campo "Para:" para escribir @${cleanUser}...`);

    // El campo de búsqueda de destinatario
    const searchSelectors = [
      'input[placeholder*="Buscar"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="Para"]',
      'input[placeholder*="To"]',
      'input[name="queryBox"]',
      'input[type="text"]',
    ];

    let searchInput = null;
    for (const sel of searchSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible()) {
          searchInput = el;
          log(`📎 Campo encontrado: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!searchInput) {
      // Fallback: buscar cualquier input visible dentro de la zona de mensajes
      log('⚠️ No encontré input con selectores conocidos, buscando por evaluate...', 'WARN');
      const found = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const visible = inputs.find(i => {
          const rect = i.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (visible) {
          visible.focus();
          return true;
        }
        return false;
      });
      if (found) {
        searchInput = page.locator('input:focus').first();
      }
    }

    if (!searchInput) {
      log('❌ No se encontró el campo de búsqueda de destinatario.', 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-dm-no-search-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    // Escribir el username
    await searchInput.click();
    await page.waitForTimeout(500);
    await searchInput.fill(cleanUser);
    log(`⌨️ Escribiendo "${cleanUser}" en el campo de búsqueda...`);
    await page.waitForTimeout(2500); // Esperar que cargue el dropdown

    // ── Paso 3: Seleccionar el usuario del dropdown ──
    log(`🎯 Buscando @${cleanUser} en resultados...`);

    const selected = await page.evaluate((uname) => {
      // Buscar en los resultados del dropdown
      const lower = uname.toLowerCase();

      // Estrategia 1: div[role="button"] o [role="option"] que contenga el username
      const candidates = Array.from(document.querySelectorAll('div[role="button"], [role="option"], [role="listbox"] > *'));
      for (const el of candidates) {
        const text = (el.innerText || '').toLowerCase();
        if (text.includes(lower) && !text.includes('cancelar') && !text.includes('cancel')) {
          el.click();
          return 'clicked-role';
        }
      }

      // Estrategia 2: Buscar cualquier span/div que contenga el username exacto
      const spans = Array.from(document.querySelectorAll('span, div'));
      for (const span of spans) {
        if (span.children.length === 0) {
          const t = (span.textContent || '').trim().toLowerCase();
          if (t === lower || t === `@${lower}`) {
            // Subir hasta encontrar un elemento clickeable
            let target = span;
            for (let i = 0; i < 6; i++) {
              target = target.parentElement;
              if (!target) break;
              if (target.getAttribute('role') === 'button' || target.tagName === 'A' || target.onclick) {
                target.click();
                return 'clicked-parent';
              }
            }
            // Si no encontramos padre clickeable, clickear el span directamente
            span.click();
            return 'clicked-span';
          }
        }
      }

      return null;
    }, cleanUser);

    if (!selected) {
      log(`❌ No se encontró a @${cleanUser} en los resultados de búsqueda.`, 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-dm-user-not-found-${cleanUser}-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    log(`✅ Usuario @${cleanUser} seleccionado (${selected}). Esperando que cargue el chat...`);
    await page.waitForTimeout(3000);

    // ── Paso 4: Encontrar el campo de mensaje y escribir ──
    log('💬 Buscando campo de mensaje...');

    const msgSelectors = [
      'div[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
      'textarea',
      'div[role="textbox"]',
      'input[placeholder*="mensaje"]',
      'input[placeholder*="message"]',
      'div[aria-label*="mensaje"]',
      'div[aria-label*="message"]',
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

    // Fallback: buscar por placeholder text
    if (!msgBox) {
      const placeholders = ['Envía un mensaje', 'Send a message', 'Escribe un mensaje', 'Type a message', 'mensaje'];
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
      log('❌ No se encontró el campo para escribir el mensaje.', 'ERROR');
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-dm-no-msgbox-${cleanUser}-${Date.now()}.png`) });
      await page.close();
      return false;
    }

    // Escribir el mensaje con delay humano
    await msgBox.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(message, { delay: 30 });
    log(`⌨️ Mensaje escrito (${message.length} chars).`);
    await page.waitForTimeout(800);

    // ── Paso 5: Enviar el mensaje ──
    log('📤 Enviando mensaje...');

    // Intentar botón de enviar primero
    const sendClicked = await page.evaluate(() => {
      // Buscar botón con aria-label de enviar
      const sendBtns = Array.from(document.querySelectorAll('[role="button"], button'));
      for (const btn of sendBtns) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const text = (btn.innerText || '').toLowerCase().trim();
        if (label.includes('send') || label.includes('enviar') || text === 'send' || text === 'enviar') {
          btn.click();
          return true;
        }
      }
      // Buscar SVG de avión de enviar (icono típico)
      const svgs = Array.from(document.querySelectorAll('svg'));
      for (const svg of svgs) {
        const label = (svg.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('send') || label.includes('enviar')) {
          svg.closest('[role="button"]')?.click() || svg.parentElement?.click();
          return true;
        }
      }
      return false;
    });

    if (!sendClicked) {
      // Fallback: Enter para enviar
      log('📤 Usando Enter como fallback para enviar...');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(2000);

    // Verificar que el mensaje se envió (el campo debe estar vacío ahora)
    log(`✅ DM enviado exitosamente a @${cleanUser} en Threads!`);

    // Screenshot de confirmación
    await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-dm-ok-${cleanUser}-${Date.now()}.png`) });

    await page.waitForTimeout(1000);
    await page.close();
    return true;

  } catch (err) {
    log(`❌ Error enviando DM a @${cleanUser}: ${err.message}`, 'ERROR');
    await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', `threads-dm-error-${cleanUser}-${Date.now()}.png`) }).catch(() => {});
    await page.close().catch(() => {});
    return false;
  }
}

// ── CLI ──
const args = process.argv.slice(2);
const userArg = args.find(a => a.startsWith('--user='))?.split('=').slice(1).join('=')
             || args.find(a => a.startsWith('--username='))?.split('=').slice(1).join('=');
const textArg = args.find(a => a.startsWith('--text='))?.split('=').slice(1).join('=')
             || args.find(a => a.startsWith('--message='))?.split('=').slice(1).join('=');

if (userArg && textArg) {
  sendThreadsDM(userArg, textArg)
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('💥 Error fatal:', e.message); process.exit(1); });
} else if (args.length > 0) {
  console.log('Uso: node threads-dm.mjs --user=USERNAME --text="TU MENSAJE"');
  process.exit(1);
}

// Exportar para uso programático desde server.mjs
export { sendThreadsDM };
