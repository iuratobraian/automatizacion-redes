import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { getPlaywriterCdpUrl } from './playwriter-helper.mjs';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');

let IG_ACCOUNT = 'braiurato';
if (fs.existsSync(CONFIG_PATH)) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    IG_ACCOUNT = config.selectedAccount || IG_ACCOUNT;
  } catch (e) {}
}

const threadsAuthFile = path.join(PROJECT_ROOT, '.agent', `threads_auth_${IG_ACCOUNT}.json`);
const igAuthFile = path.join(PROJECT_ROOT, '.agent', `instagram_auth_${IG_ACCOUNT}.json`);
const authFile = fs.existsSync(threadsAuthFile) ? threadsAuthFile : igAuthFile;

function log(msg, type = "INFO") {
  const timestamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${timestamp}] [THREADS] [${type}] ${msg}`);
}

async function run(inputText, inputImage) {
  let text = '';
  let imagePath = inputImage || '';
  
  if (inputText) {
    text = inputText;
  } else {
    const args = process.argv.slice(2);
    const textArg = args.find(a => a.startsWith('--text='));
    if (!textArg) {
      log("Error: Falta parámetro --text", "ERROR");
      process.exit(1);
    }
    text = textArg.substring('--text='.length);

    const imageArg = args.find(a => a.startsWith('--image='));
    if (imageArg) {
      imagePath = imageArg.substring('--image='.length);
    }
  }

  // Threads character limit safety (max 500 characters)
  if (text.length > 500) {
    log(`Advertencia: El texto excede el límite de 500 caracteres de Threads (${text.length} chars). Truncando elegantemente...`, "WARN");
    text = text.substring(0, 497) + "...";
  }

  log(`Preparando publicación en Threads: "${text.slice(0, 50)}..."`);
  if (imagePath) log(`Imagen adjunta: ${imagePath}`);

  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  let headless = true;
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      headless = config.headless !== undefined ? config.headless : true;
    } catch(e){}
  }

  let browser;
  let context;
  let page;
  let isPlaywriter = false;

  // Intentar conectar a Playwriter (Navegador Real del Usuario)
  try {
    log("🔗 Intentando conectar a Playwriter (Puerto 19988)...");
    const cdpUrl = await getPlaywriterCdpUrl({ port: 19988, host: '127.0.0.1' });
    browser = await coreChromium.connectOverCDP(cdpUrl);
    isPlaywriter = true;
    log("✅ ¡Conectado a Playwriter exitosamente!");
    context = browser.contexts()[0];
    
    // Buscar si ya hay pestaña de threads o crear nueva
    const pages = context.pages();
    page = pages.find(p => p.url().includes('threads.net'));
    if (!page) {
      page = await context.newPage();
    } else {
      log("🔄 Reutilizando pestaña existente de Threads.");
    }
  } catch (e) {
    log(`❌ ERROR CRÍTICO: La conexión a Playwriter falló (${e.message}).`, "ERROR");
    log("👉 ES OBLIGATORIO utilizar tu navegador personal mediante Playwriter para esta operación.", "ERROR");
    log("👉 Por favor, asegúrate de que el daemon de Playwriter y PM2 estén activos y corriendo en el puerto 19988.", "ERROR");
    process.exit(1);
  }


  try {
    log("Navegando a Threads.net...");
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Esperar un momento a que se aplique la sesión
    await page.waitForTimeout(3000);

    // Verificar si estamos logueados o si pide login
    const isLoggedIn = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Perfil') || text.includes('Para ti') || text.includes('Buscar') || text.includes('Guardado') || text.includes('Publicar') || text.includes('Start a thread') || text.includes('Iniciar un hilo') || text.includes('novedades');
    });

    if (!isLoggedIn) {
      log("Sesión de Instagram no detectada automáticamente en Threads. Intentando hacer login con el botón de Instagram...", "WARN");
      const igLoginBtn = await page.$('div[role="button"]:has-text("Continue with Instagram"), button:has-text("Instagram"), div[role="button"]:has-text("Continuar con Instagram"), div[role="button"]:has-text("Iniciar sesión con Instagram")').catch(() => null);
      if (igLoginBtn) {
        await igLoginBtn.click({ force: true }).catch(async () => {
          await page.evaluate(el => el.click(), igLoginBtn);
        });
        log("Esperando a que la sesión se autorice y cargue el feed principal...");
        await page.waitForSelector('div[role="button"]:has-text("Start a thread"), div[aria-label="New thread"], [placeholder*="Start a thread"], div[role="button"]:has-text("¿Qué novedades tienes?"), [placeholder*="novedades"], div[role="button"]:has-text("Iniciar un hilo"), [placeholder*="hilo"]', { timeout: 25000 }).catch(() => null);
        await page.waitForTimeout(3000);
        await context.storageState({ path: authFile });
        log("Sesión guardada y validada tras conectar Threads con Instagram.");
      } else {
        log("No se pudo detectar el botón de login automático de Instagram en Threads.", "ERROR");
        await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', 'threads_login_error.png') });
        if (page) await page.close().catch(() => {});
        await browser.disconnect().catch(() => {});
        process.exit(1);
      }
    }

    await publishThreadsPost(page, text, imagePath);
  } catch (err) {
    log(`Error publicando en Threads: ${err.message}`, "ERROR");
    try {
      await page.screenshot({ path: path.join(PROJECT_ROOT, '.agent', 'threads_publish_error.png') });
    } catch(e){}
  } finally {
    try {
      if (page) {
        log("🧹 Cerrando pestaña dedicada de Threads...");
        await page.close().catch(() => {});
      }
    } catch(e){}
    if (browser) {
      log("🔌 Desconectando de Playwriter...");
      try {
        if (typeof browser.disconnect === 'function') {
          await browser.disconnect();
        } else if (typeof browser.close === 'function') {
          await browser.close();
        }
      } catch (e) {
        log(`⚠️ Error al desconectar el navegador: ${e.message}`, 'WARN');
      }
    }
  }

async function publishThreadsPost(page, text, imagePath) {
  log("Abriendo modal de nueva publicación...");
  // 1. Hacer clic en "¿Qué novedades tienes?" para abrir el modal
  await page.click('div[contenteditable], div[placeholder], [placeholder="¿Qué novedades tienes?"]').catch(() => {});
  await page.waitForTimeout(1000);
  
  // 2. Si hay un modal de nuevo hilo, esperar que esté visible
  await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
  
  // 3. Escribir el texto en el campo correcto dentro del modal
  const inputSelectors = [
    'div[role="dialog"] div[contenteditable="true"]',
    'div[role="dialog"] textarea',
    'div[role="dialog"] [data-lexical-editor="true"]',
  ];
  
  let inputField = null;
  for (const sel of inputSelectors) {
    try {
      inputField = page.locator(sel).first();
      if (await inputField.isVisible({ timeout: 3000 })) break;
    } catch (e) { continue; }
  }
  
  if (!inputField) {
    throw new Error("No se pudo localizar el campo de texto dentro del modal de Threads.");
  }

  // Click en el campo y escribir
  await inputField.click();
  await page.waitForTimeout(500);
  await inputField.fill(''); // limpiar primero
  await inputField.type(text, { delay: 30 }); // delay para simular escritura humana
  await page.waitForTimeout(1000);
  
  // Adjuntar imagen si se especifica
  if (imagePath && fs.existsSync(imagePath)) {
    log(`Adjuntando imagen a la publicación de Threads: ${imagePath}`);
    try {
      const fileInput = page.locator('div[role="dialog"] input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(imagePath);
        log("✅ Imagen adjuntada exitosamente a la publicación");
        await page.waitForTimeout(2000);
      } else {
        log("⚠️ No se encontró el input tipo file directo en el modal.", "WARN");
      }
    } catch (err) {
      log(`⚠️ Error al adjuntar imagen en Threads: ${err.message}`, "WARN");
    }
  }
  
  // 4. Buscar y hacer clic en el botón "Publicar" dentro del modal
  const publishButtonSelectors = [
    'div[role="dialog"] button:has-text("Publicar")',
    'div[role="dialog"] button:has-text("Post")',
    'div[role="dialog"] div[role="button"]:has-text("Publicar")',
    'button.x1i10hfl:has-text("Publicar")',
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
  
  // Esperar que el botón esté habilitado (se habilita cuando hay texto)
  try {
    await page.waitForFunction(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return false;
      const buttons = dialog.querySelectorAll('button');
      for (const btn of buttons) {
        if ((btn.textContent.includes('Publicar') || btn.textContent.includes('Post')) 
            && !btn.disabled) {
          return true;
        }
      }
      return false;
    }, { timeout: 10000 });
  } catch (e) {}

  if (!publishButton) {
    publishButton = page.locator('div[role="dialog"] button:not([disabled]), div[role="dialog"] div[role="button"]:has-text("Publicar"), div[role="dialog"] div[role="button"]:has-text("Post")').last();
  }
  
  await page.waitForTimeout(500);
  
  // Click en publicar
  try {
    await publishButton.scrollIntoViewIfNeeded().catch(() => {});
    await publishButton.click({ timeout: 10000 });
  } catch (e) {
    try {
      await publishButton.click({ force: true, timeout: 5000 });
    } catch (err) {}
  }
  
  // Verificar publicación exitosa
  await page.waitForTimeout(2000);
  const dialogGone = await page.locator('div[role="dialog"]').isVisible().catch(() => false);
  if (!dialogGone) {
    log("✅ Post en Threads publicado exitosamente");
  }
}

export function parseNumber(text) {
  const clean = String(text || '').toLowerCase().trim().replace(',', '.');
  if (clean.includes('k')) return Math.round(parseFloat(clean) * 1000) || 0;
  if (clean.includes('m')) return Math.round(parseFloat(clean) * 1000000) || 0;
  return parseInt(clean, 10) || 0;
}

export async function getHighEngagementPosts(page, keywords = ['trading', 'forex', 'cripto', 'bitcoin']) {
  const posts = [];
  
  for (const keyword of keywords) {
    log(`🔍 Buscando en Threads para keyword: [${keyword}]`);
    await page.goto(`https://www.threads.net/search?q=${keyword}&serp_type=default`);
    await page.waitForTimeout(3000);
    
    // Scroll para cargar más posts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(1500);
    }
    
    // Extraer posts con sus métricas de engagement
    const pagePosts = await page.evaluate(() => {
      // Helper para convertir "2.3k" → 2300
      function parseNumber(text) {
        const clean = text.toLowerCase().trim();
        if (clean.includes('k')) return parseFloat(clean) * 1000;
        if (clean.includes('m')) return parseFloat(clean) * 1000000;
        return parseInt(clean) || 0;
      }

      const postElements = document.querySelectorAll('article, div[data-pressable-container]');
      const extracted = [];
      
      postElements.forEach(post => {
        const likeElements = post.querySelectorAll('span');
        let likes = 0;
        let replies = 0;
        
        likeElements.forEach(span => {
          const text = span.textContent.trim();
          if (text.match(/^\d+$/) || text.match(/^\d+[km]$/i)) {
            const num = parseNumber(text);
            if (likes === 0) likes = num;
            else if (replies === 0) replies = num;
          }
        });
        
        const link = post.querySelector('a[href*="/post/"]');
        const username = post.querySelector('a[href*="/@"]');
        const textContent = post.querySelector('div[dir="auto"]');
        
        if (link && (likes > 5 || replies > 2)) {
          extracted.push({
            url: link.href,
            username: username ? username.getAttribute('href') : '',
            text: textContent ? textContent.textContent.substring(0, 100) : '',
            likes,
            replies,
            engagement: likes + (replies * 2)
          });
        }
      });
      
      return extracted;
    });
    
    posts.push(...pagePosts);
  }
  
  // Ordenar por engagement y devolver top 20
  return posts
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 20)
    .filter((post, index, self) => 
      index === self.findIndex(p => p.url === post.url)
    );
}

export async function publishToThreads(caption) {
  await run(caption);
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
