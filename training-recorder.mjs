/**
 * training-recorder.mjs
 * ══════════════════════════════════════════════════════════════
 * RUEDA DE ENTRENAMIENTO — Graba dónde el usuario hace click
 * para que el bot aprenda exactamente qué elemento presionar.
 * 
 * Uso:
 *   node automatizacion-redes/training-recorder.mjs --site=instagram
 *   node automatizacion-redes/training-recorder.mjs --site=threads
 * 
 * Durante el entrenamiento:
 *   1. La ventana del navegador se abre con instrucciones
 *   2. El usuario navega y hace click en los botones correctos
 *   3. El script graba: selector CSS, texto, coordenadas, aria-label
 *   4. Se guardan en .agent/training-clicks-instagram.json / training-clicks-threads.json
 *   5. Los scripts de publicación leen este archivo para saber exactamente dónde clickear
 * ══════════════════════════════════════════════════════════════
 */

import { chromium as coreChromium } from '@xmorse/playwright-core';
import { getCdpUrl } from 'playwriter';
import { chromium as localChromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AGENT_DIR = path.join(ROOT, '.agent');

// ─── Parsear args ────────────────────────────────────────────
const argv = process.argv.slice(2);
const args = {};
for (const arg of argv) {
  if (arg.includes('=')) {
    const [k, v] = arg.split('=');
    args[k.replace('--', '')] = v;
  } else {
    args[arg.replace('--', '')] = true;
  }
}

const site = (args.site || 'instagram').toLowerCase();

const SITES = {
  instagram: {
    url: 'https://www.instagram.com/',
    trainingFile: path.join(AGENT_DIR, 'training-clicks-instagram.json'),
    steps: [
      { name: 'crear_post', instruction: '🖱️ PASO 1: Haz click en el botón CREAR (ícono + o "Crear") en la barra lateral izquierda' },
      { name: 'publicacion_option', instruction: '🖱️ PASO 2: Haz click en la opción "Publicación" del menú que aparece' },
      { name: 'siguiente_1', instruction: '🖱️ PASO 3 (Después de cargar imagen): Haz click en el botón SIGUIENTE (paso 1 - recorte)' },
      { name: 'siguiente_2', instruction: '🖱️ PASO 4: Haz click en el botón SIGUIENTE (paso 2 - filtros)' },
      { name: 'siguiente_3', instruction: '🖱️ PASO 5: Haz click en el botón SIGUIENTE (paso 3 - caption) [SALTAR si no aparece]' },
      { name: 'compartir', instruction: '🖱️ PASO 6 (CRÍTICO): Haz click en el botón COMPARTIR / PUBLICAR (botón azul final)' },
    ]
  },
  threads: {
    url: 'https://www.threads.net/',
    trainingFile: path.join(AGENT_DIR, 'training-clicks-threads.json'),
    steps: [
      { name: 'crear_post', instruction: '🖱️ PASO 1: Haz click en el botón CREAR NUEVO POST (ícono + o lapicera en la barra de navegación)' },
      { name: 'publicar', instruction: '🖱️ PASO 2: Haz click en el botón PUBLICAR / ENVIAR (después de escribir el texto)' },
      { name: 'enviar_comentario', instruction: '🖱️ PASO 3: Haz click en el botón ENVIAR COMENTARIO (cuando escribís en un hilo)' },
    ]
  }
};

const config = SITES[site];
if (!config) {
  console.error(`❌ Sitio no reconocido: "${site}". Usa --site=instagram o --site=threads`);
  process.exit(1);
}

// ─── Guardar/Cargar clicks entrenados ────────────────────────
function loadTrainingData() {
  try {
    if (fs.existsSync(config.trainingFile)) {
      return JSON.parse(fs.readFileSync(config.trainingFile, 'utf-8'));
    }
  } catch {}
  return { site, clicks: {}, trainedAt: null };
}

function saveTrainingData(data) {
  data.trainedAt = new Date().toISOString();
  fs.writeFileSync(config.trainingFile, JSON.stringify(data, null, 2));
  console.log(`\n✅ Datos de entrenamiento guardados en: ${config.trainingFile}`);
}

// ─── Main ────────────────────────────────────────────────────
async function runTraining() {
  console.log('\n' + '═'.repeat(60));
  console.log(`🎓 RUEDA DE ENTRENAMIENTO — ${site.toUpperCase()}`);
  console.log('═'.repeat(60));
  console.log('Este modo te permite enseñarle al bot exactamente dónde');
  console.log('hacer click. Haz click en los botones cuando se te pida.');
  console.log('El bot grabará el selector CSS exacto del elemento.');
  console.log('═'.repeat(60) + '\n');

  let browser, context, page;
  let isPlaywriter = false;

  // Para evitar colisiones con el bot vigilador de comentarios,
  // abriremos una ventana limpia, dedicada e independiente de Chromium local
  // emulando un iPhone 14 Pro Max.
  isPlaywriter = false;

  if (!isPlaywriter) {
    console.log('🚀 Iniciando Chromium local...');
    const sessionPath = path.join(AGENT_DIR, `instagram_auth_tradeshare.ok.json`);
    const fallback = path.join(AGENT_DIR, 'instagram_auth.json');
    const sess = fs.existsSync(sessionPath) ? sessionPath : fallback;
    
    browser = await localChromium.launch({ headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    
    const contextOptions = {
      viewport: { width: 430, height: 932 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    };
    
    if (fs.existsSync(sess)) {
      const state = JSON.parse(fs.readFileSync(sess, 'utf-8'));
      context = await browser.newContext({
        storageState: state,
        ...contextOptions
      });
    } else {
      context = await browser.newContext(contextOptions);
    }
    
    page = await context.newPage();
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  // Asegurar que estamos en la URL correcta
  const currentUrl = page.url();
  if (!currentUrl.includes(site === 'instagram' ? 'instagram' : 'threads')) {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  console.log(`\n📍 URL actual: ${page.url()}`);
  console.log('\n🎓 INSTRUCCIONES:');
  console.log('• Cuando veas "→ ESPERANDO CLICK..." en la terminal, haz click en el elemento indicado en el navegador');
  console.log('• El bot capturará automáticamente qué elemento clickeaste');
  console.log('• Escribe "saltar" para omitir un paso, "cancelar" para salir\n');

  const trainingData = loadTrainingData();
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const waitForEnter = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  for (const step of config.steps) {
    console.log('\n' + '─'.repeat(60));
    console.log(`📌 ${step.instruction}`);
    console.log('─'.repeat(60));
    
    // Inyectar listener de click temporal
    await page.evaluate(() => {
      window.__trainingLastClick = null;
      
      const handler = (event) => {
        const el = event.target;
        
        // Generar selector preciso del elemento
        function getSelector(el) {
          if (el.id) return `#${el.id}`;
          
          const parts = [];
          let current = el;
          let depth = 0;
          
          while (current && current !== document.body && depth < 5) {
            let selector = current.tagName.toLowerCase();
            
            if (current.getAttribute('role')) {
              selector += `[role="${current.getAttribute('role')}"]`;
            }
            if (current.getAttribute('aria-label')) {
              selector += `[aria-label="${current.getAttribute('aria-label')}"]`;
            }
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
              if (classes) selector += `.${classes}`;
            }
            
            parts.unshift(selector);
            current = current.parentElement;
            depth++;
          }
          
          return parts.join(' > ');
        }
        
        // Recopilar toda la info del elemento clickeado
        const rect = el.getBoundingClientRect();
        window.__trainingLastClick = {
          tagName: el.tagName.toLowerCase(),
          text: (el.textContent || el.innerText || '').trim().substring(0, 100),
          selector: getSelector(el),
          ariaLabel: el.getAttribute('aria-label') || '',
          role: el.getAttribute('role') || '',
          dataTestId: el.getAttribute('data-testid') || '',
          className: el.className || '',
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          href: el.getAttribute('href') || el.closest('a')?.getAttribute('href') || '',
          svgAriaLabel: el.querySelector('svg')?.getAttribute('aria-label') || el.closest('svg')?.getAttribute('aria-label') || '',
          parentText: el.parentElement ? (el.parentElement.textContent || '').trim().substring(0, 50) : '',
          timestamp: Date.now()
        };
        
        // Flash visual para feedback
        const originalBorder = el.style.border;
        const originalOutline = el.style.outline;
        el.style.border = '3px solid #00ff00';
        el.style.outline = '3px solid lime';
        setTimeout(() => {
          el.style.border = originalBorder;
          el.style.outline = originalOutline;
        }, 1500);
      };
      
      document.addEventListener('click', handler, { capture: true, once: true });
      return true;
    });
    
    const input = await waitForEnter(`\n→ ESPERANDO CLICK en "${step.name}"... (presiona Enter DESPUÉS de hacer click, o escribe "saltar"): `);
    
    if (input.trim().toLowerCase() === 'cancelar') {
      console.log('❌ Entrenamiento cancelado.');
      break;
    }
    
    if (input.trim().toLowerCase() === 'saltar') {
      console.log(`⏭️ Paso "${step.name}" saltado.`);
      continue;
    }
    
    // Leer el último click registrado
    const clickData = await page.evaluate(() => window.__trainingLastClick);
    
    if (clickData) {
      trainingData.clicks[step.name] = clickData;
      console.log(`\n✅ CLICK GRABADO para "${step.name}":`);
      console.log(`   Elemento: <${clickData.tagName}>`);
      console.log(`   Texto: "${clickData.text.substring(0, 60)}"`);
      console.log(`   Coordenadas: (${clickData.x}, ${clickData.y})`);
      if (clickData.ariaLabel) console.log(`   aria-label: "${clickData.ariaLabel}"`);
      if (clickData.svgAriaLabel) console.log(`   SVG aria-label: "${clickData.svgAriaLabel}"`);
      console.log(`   Selector: ${clickData.selector.substring(0, 80)}`);
    } else {
      console.log(`⚠️ No se detectó click para "${step.name}". Asegúrate de hacer click en el navegador ANTES de presionar Enter.`);
    }
  }
  
  rl.close();
  
  // Guardar datos de entrenamiento
  saveTrainingData(trainingData);
  
  console.log('\n' + '═'.repeat(60));
  console.log('🎓 ENTRENAMIENTO COMPLETADO');
  console.log('Clicks grabados:');
  Object.keys(trainingData.clicks).forEach(key => {
    const click = trainingData.clicks[key];
    console.log(`  ✅ ${key}: "${click.text.substring(0, 40)}" @ (${click.x}, ${click.y})`);
  });
  console.log('═'.repeat(60));
  console.log('\nLos bots usarán estos clicks en la próxima ejecución.');
  
  if (!isPlaywriter) {
    await browser.close();
  }
}

runTraining().catch(err => {
  console.error('💥 Error en entrenamiento:', err.message);
  process.exit(1);
});
