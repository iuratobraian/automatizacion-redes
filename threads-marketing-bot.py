#!/usr/bin/env python3
"""
TradeShare Threads Outreach Marketing Bot — Powered by Playwright
================================================================
Automatiza la búsqueda de publicaciones de trading en Threads,
e invita de forma orgánica y aleatoria a traders usando 50 frases
diferentes para evitar bloqueos por spam.

Uso:
  python3 threads-marketing-bot.py --tags trading forex crypto --limit 10
  python3 threads-marketing-bot.py --interactive   # Para loguearte manualmente primero
"""

import sys
import os
import time
import random
import argparse
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path

# Intentar importar Playwright
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Error: playwright no está instalado. Instálalo ejecutando:")
    print("  pip3 install playwright && playwright install")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
COOKIES_FILE = SCRIPT_DIR / ".threads-cookies.json"

# ─── Registro de Posts Ya Comentados (Anti-Ban, Anti-Duplicados) ───────────────
COMMENTED_POSTS_FILE = SCRIPT_DIR / ".threads-commented-posts.json"

def load_commented_posts() -> set:
    """Carga el registro de posts ya comentados, normalizando las URLs (remueve query string)."""
    try:
        if COMMENTED_POSTS_FILE.exists():
            data = json.loads(COMMENTED_POSTS_FILE.read_text())
            posts = data.get('posts', [])
            # Normalizar eliminando el query string (?...)
            normalized = []
            for p in posts:
                if '?' in p:
                    p = p.split('?')[0]
                normalized.append(p)
            return set(normalized)
    except Exception:
        pass
    return set()

def save_commented_post(post_url: str, commented_set: set) -> None:
    """Guarda un post como comentado normalizando su URL."""
    normalized_url = post_url.split('?')[0] if '?' in post_url else post_url
    commented_set.add(normalized_url)
    try:
        COMMENTED_POSTS_FILE.write_text(json.dumps({'posts': list(commented_set)}, indent=2))
    except Exception as e:
        print(f"  ⚠️ Error guardando registro de posts comentados: {e}")

def report_lead_to_crm(post_url: str, comment_text: str) -> bool:
    """Extrae el usuario de Threads desde la URL del post y lo registra en el CRM."""
    try:
        match = re.search(r'@([a-zA-Z0-9._]+)', post_url)
        if not match:
            print("    ⚠️ No se pudo extraer el usuario de la URL del post.")
            return False
            
        username = match.group(1)
        crm_url = "http://localhost:5680/api/leads"
        payload = {
            "username": f"@{username}",
            "platform": "Threads",
            "source": "Threads Marketing Bot",
            "status": "Comentado",
            "notes": f"Invitación automática enviada en el post: {post_url}\nFrase: \"{comment_text}\""
        }
        
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(crm_url, data=data, headers={'Content-Type': 'application/json'})
        
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            if res_data.get("success"):
                print(f"    📡 CRM: @{username} registrado exitosamente como lead 'Comentado'.")
                return True
            else:
                print(f"    ⚠️ CRM: El servidor devolvió error al registrar el lead.")
    except Exception as e:
        print(f"    ⚠️ CRM: No se pudo conectar con el Cockpit para registrar el lead ({e}).")
    return False

# ─── Biblioteca de Comentarios de Trading Orgánicos y Generadores de Debate ──
ORGANIC_TRADING_COMMENTS = [
    # Price Action, Estructura y SMC
    "Gran lectura del gráfico. ¿Sueles esperar confirmación de cambio de estructura (CHoCH) en M5 o entras con orden límite directa al Order Block?",
    "Muy buen análisis de la acción del precio. Los retrocesos al Fair Value Gap (FVG) en la sesión de NY suelen dar las mejores entradas.",
    "Impecable el mapeo. ¿Cómo filtras cuando el mercado barre el máximo asiático en Londres? Suele dar un fakeout antes de la verdadera dirección.",
    "Totalmente de acuerdo con esa zona. ¿Dejas correr la posición hasta el siguiente pool de liquidez o aseguras parciales fijos?",
    "Qué buen setup. En índices como el Nasdaq muchas veces barren la liquidez de los primeros 15 minutos antes de expandir. ¿Operas la apertura?",
    "Excelente perspectiva. La clave ahí es el volumen y la absorción institucional. ¿Te apoyas en VWAP o prefieres el gráfico 100% limpio?",
    "Muy fino el análisis. Es clave esperar que cierre la vela de temporalidad mayor para no quedar atrapado en una mecha de manipulación.",
    "Gran enfoque técnico. En TradeShare solemos debatir mucho si conviene dejar correr el trade original o mover a Break Even rápido. ¿Cómo lo gestionas vos?",
    "Buena proyección. El quiebre con cuerpo de vela en H1 valida mucho mejor la continuidad que una simple mecha de absorción.",
    "Interesante zona de oferta. Si entra volumen institucional en esa confluencia, el ratio riesgo/beneficio es brutal.",

    # Gestión de Riesgo, Psicología y Cuentas Fondeadas
    "Totalmente. El winrate es secundario cuando tu ratio riesgo/beneficio es consistente. ¿Qué R:R promedio buscas en esta estrategia?",
    "La regla de oro: arriesgar máximo 0.5% o 0.75% por trade. En cuentas de fondeo esa disciplina es lo único que te salva del daily drawdown.",
    "Gran reflexión. Cerrar la pantalla cuando se cumple el plan del día es lo que separa a los consistentes del 95% que termina sobreoperando.",
    "Totalmente de acuerdo. Las pérdidas pequeñas son simplemente costos operativos; el problema es cuando el ego no te deja aceptar el stop loss.",
    "Imprescindible la gestión del capital. Si una sola operación te quita el sueño o te hace dudar, es señal clara de que el lotaje está sobredimensionado.",
    "Exacto. En trading profesional no se busca tener siempre la razón, se busca maximizar la esperanza matemática positiva.",
    "El diario de trading lo cambia todo. Cuando ves tus errores anotados con métricas frías, dejas de operar por impulsos o revancha.",
    "La paciencia aburrida paga más que la adrenalina. Buen recordatorio de disciplina para la comunidad.",

    # Oro, Índices, Futuros y Cripto
    "El Oro (XAUUSD) cuando agarra volumen institucional en la sesión americana es implacable. Buena cautela con los niveles.",
    "Muy buen gráfico de futuros. La profundidad del libro de órdenes (DOM) ayuda mucho a entender si hay absorción o continuación.",
    "Interesante visión de Forex. El par EURUSD viene respetando muy bien los niveles de liquidez externa en temporalidades de H1.",
    "Excelente lectura de Bitcoin. Mientras mantenga la estructura en 4 horas, la presión compradora sigue intacta.",
    "En el Nasdaq (NQ) el retroceso de las 10:00 AM suele ser quirúrgico. Gran timing de entrada.",

    # Preguntas de Debate Abierto (Conversación)
    "Pregunta para debatir: ¿prefieren operar con stop loss fijo en pips/puntos o siempre adaptado al último swing estructural?",
    "Interesante punto de vista. ¿Qué porcentaje de efectividad tienes testeado en este patrón con tu bitácora de trading?",
    "Gran debate: ¿operar las noticias de alto impacto (CPI, NFP) o quedarse fuera 15 minutos antes y después para evitar el deslizamiento de spread?",
    "¿Qué temporalidad consideras tu 'timeframe maestro' para definir el sesgo direccional de la sesión? Buen post.",
    "Totalmente. El mejor trade de la semana muchas veces es aquel que decidiste NO tomar por falta de confluencias.",
    "Brutal análisis. Da gusto encontrar contenido técnico real sin el típico humo de las redes. Te felicito."
]

def get_random_phrase() -> str:
    return random.choice(ORGANIC_TRADING_COMMENTS)

def generate_dynamic_comment(username: str, post_text: str) -> str:
    """Consulta la API de IA local para generar un comentario orgánico, técnico y humano."""
    api_url = "http://localhost:5680/api/ai/chat"
    try:
        clean_user = username.replace("@", "").strip()
        system_instruction = (
            f"Actúa como un trader experimentado y analítico en la red social Threads. "
            f"El usuario @{clean_user} publicó: \"{post_text}\". "
            f"Genera un comentario breve (1 a 2 oraciones máximo) en español. "
            f"Debe aportar una perspectiva técnica (sobre liquidez, gestión de riesgo, acción del precio o confluencias) "
            f"o hacer una pregunta abierta constructiva de trading para iniciar debate. "
            f"NO parezcas un bot, NO uses hashtags ni enlaces promocionales, sé natural, amigable y profesional."
        )
        payload = { "message": system_instruction }
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            api_url, 
            data=data, 
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            if res_data.get("success") and res_data.get("reply"):
                clean_reply = res_data.get("reply").strip().replace('"', '')
                print(f"    🤖 IA Local generó respuesta: \"{clean_reply[:60]}...\"")
                return clean_reply
    except Exception as e:
        # Fallback a la biblioteca orgánica de trading
        pass
    return get_random_phrase()

def human_type_fast(page, text: str):
    """Simula tipeo humano ágil y natural, con ráfagas rápidas y micro-pausas en puntuación."""
    for char in text:
        page.keyboard.type(char)
        if char in ['.', ',', '?', '!', ':']:
            time.sleep(random.uniform(0.10, 0.22))
        elif char == ' ':
            time.sleep(random.uniform(0.03, 0.07))
        else:
            time.sleep(random.uniform(0.015, 0.040))

def smooth_human_scroll(page, num_scrolls=5):
    """Realiza scrolls orgánicos simulando la lectura natural de una persona."""
    viewport = page.viewport_size or {"width": 1280, "height": 800}
    for i in range(num_scrolls):
        scroll_amount = random.randint(260, 520)
        
        # Mover ligeramente el mouse a una zona de lectura para emular interacción real
        target_x = random.randint(viewport["width"] // 4, viewport["width"] * 3 // 4)
        target_y = random.randint(viewport["height"] // 4, viewport["height"] * 3 // 4)
        try:
            page.mouse.move(target_x, target_y, steps=random.randint(3, 6))
        except Exception:
            pass
            
        page.mouse.wheel(0, scroll_amount)
        # Micro-espera de lectura humana (0.6s a 1.6s)
        time.sleep(random.uniform(0.6, 1.6))
        
        # Ocasionalmente hace un leve retroceso (como releyendo un titular o gráfico)
        if random.random() < 0.22:
            page.mouse.wheel(0, -random.randint(50, 110))
            time.sleep(random.uniform(0.4, 0.9))

def get_playwriter_cdp_url(host="127.0.0.1", port=19988) -> str:
    """Consulta las extensiones activas en Playwriter para resolver la URL CDP correcta.
    Evita el error 'Multiple extensions connected. Specify extensionId'."""
    url = f"http://{host}:{port}/extensions/status"
    try:
        import urllib.request
        import json
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=3) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            extensions = res_data.get("extensions", [])
            if extensions:
                active = next((e for e in extensions if e.get("activeTargets", 0) > 0), extensions[0])
                ext_id = active.get("extensionId")
                print(f"🔌 [Playwriter Helper] Conexión CDP resuelta con extensionId: \"{ext_id}\"")
                return f"ws://{host}:{port}/cdp?extensionId={ext_id}"
    except Exception as e:
        print(f"⚠️ [Playwriter Helper] Falló la consulta de extensiones ({e}). Usando fallback sin extensionId.")
    return f"ws://{host}:{port}/cdp"

def setup_browser(p, interactive=False):
    """Inicializa el navegador conectándose a Playwriter (CDP) o con fallback local."""
    browser = None
    context = None
    try:
        print("🔗 Intentando conectar a Playwriter (CDP en puerto 19988)...")
        cdp_url = get_playwriter_cdp_url()
        browser = p.chromium.connect_over_cdp(cdp_url)
        print("✅ ¡Conectado a Playwriter exitosamente!")
        context = browser.contexts[0]
    except Exception as e:
        print(f"⚠️ Conexión a Playwriter falló ({e}). Levantando local Chromium...")
        browser = p.chromium.launch(
            headless=False if interactive else True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        # Cargar cookies si existen
        if COOKIES_FILE.exists():
            try:
                import json
                cookies = json.loads(COOKIES_FILE.read_text())
                context.add_cookies(cookies)
                print("✓ Cookies de Threads cargadas.")
            except Exception as e:
                print(f"⚠️ Error cargando cookies: {e}")
                
    return browser, context

def run_interactive_login():
    """Abre el navegador para login manual y guarda las cookies."""
    print("=" * 60)
    print("🔑 MODO LOGIN INTERACTIVO")
    print("=" * 60)
    print("Por favor, inicia sesión en Threads.net de forma manual en el navegador.")
    print("Una vez que estés logueado completamente, presiona ENTER en la terminal para guardar las cookies.")
    
    with sync_playwright() as p:
        browser, context = setup_browser(p, interactive=True)
        page = context.new_page()
        page.goto("https://www.threads.net/login")
        
        input("\n[!] Presiona ENTER aquí una vez que hayas iniciado sesión en la interfaz web de Threads...")
        
        # Guardar cookies
        try:
            import json
            cookies = context.cookies()
            COOKIES_FILE.write_text(json.dumps(cookies, indent=2))
            print(f"✅ Cookies guardadas con éxito en {COOKIES_FILE}")
        except Exception as e:
            print(f"❌ Error guardando cookies: {e}")
            
        browser.close()

def run_bot(tags: list, limit: int, dry_run: bool):
    """Ejecuta el bot de outreach y prospección en Threads (V4 - Home Feed Oriented)."""
    print("=" * 60)
    print(f"🤖 INICIANDO OUTREACH BOT EN THREADS — {'[DRY RUN]' if dry_run else '[LIVE MODE]'}")
    print(f"Modo: Prioridad FEED PRINCIPAL (threads.net)")
    print(f"Límite total de interacciones: {limit}")
    print("=" * 60)
    
    success_count = 0
    commented_posts = load_commented_posts()
    print(f"📋 Registro anti-ban: {len(commented_posts)} posts ya comentados previamente.")
    
    SEARCH_QUERIES = [
        "analisis trading",
        "scalping nasdaq",
        "trading xauusd oro",
        "smart money concepts forex",
        "price action trading",
        "cuentas de fondeo ftmo",
        "psicotrading consistencia",
        "estrategia trading futuros",
        "tradingview setups",
        "gestion de riesgo trading",
        "analisis tecnico btc",
        "eurusd swing trading"
    ]
    
    with sync_playwright() as p:
        browser, context = setup_browser(p, interactive=False)
        page = context.new_page()
        
        consecutive_failures = 0
        
        while success_count < limit:
            # Alternar dinámicamente entre búsquedas temáticas y feed principal
            if random.random() < 0.75:
                selected_q = random.choice(SEARCH_QUERIES)
                encoded_q = urllib.parse.quote(selected_q)
                current_url = f"https://www.threads.net/search?q={encoded_q}&serp_type=default"
                source_label = f"Búsqueda '{selected_q}'"
            else:
                current_url = "https://www.threads.net/"
                source_label = "Feed Principal (Para ti)"
                
            print(f"\n🔍 Explorando {source_label}: {current_url}...")
            try:
                page.goto(current_url)
                page.wait_for_timeout(random.randint(2500, 4000))
                
                # Desplazamiento orgánico simulando a una persona real navegando y leyendo
                print("  📜 Navegando y leyendo feed de forma orgánica...")
                smooth_human_scroll(page, num_scrolls=random.randint(3, 5))
                
                # Buscar enlaces de posts en la página
                post_links = []
                elements = page.query_selector_all("a[href*='/post/']")
                for el in elements:
                    href = el.get_attribute("href")
                    if href and "/post/" in href:
                        full_url = "https://www.threads.net" + href if href.startswith("/") else href
                        if full_url not in post_links:
                            post_links.append(full_url)
                
                print(f"  ✓ Encontradas {len(post_links)} publicaciones en {source_label}.")
                
                if not post_links:
                    print("  ⚠️ No se cargaron posts en esta sección. Pasando a la siguiente...")
                    page.wait_for_timeout(3000)
                    continue
                
                # Procesar hasta 1-2 posts relevantes en esta sección
                posts_commented_this_feed = 0
                max_posts_per_feed = random.randint(1, 2)
                commented_in_this_cycle = False
                for post_url in post_links:
                    # Normalizar la URL antes de verificar si ya está comentada
                    norm_url = post_url.split('?')[0] if '?' in post_url else post_url
                    
                    if norm_url in commented_posts:
                        continue
                        
                    print(f"  👉 Procesando post: {post_url}")
                    
                    if dry_run:
                        username = "Usuario"
                        match = re.search(r'@([a-zA-Z0-9._]+)', post_url)
                        if match:
                            username = match.group(1)
                        phrase = generate_dynamic_comment(username, "post de trading simulado en dry run")
                        print(f"    [DRY RUN] Comentario a enviar: \"{phrase}\"")
                        save_commented_post(post_url, commented_posts)
                        success_count += 1
                        commented_in_this_cycle = True
                        break
                        
                    try:
                        # Ir al post individual
                        page.goto(post_url)
                        page.wait_for_timeout(random.randint(3000, 5000))
                        
                        # Extraer username desde la URL
                        username = "Usuario"
                        match = re.search(r'@([a-zA-Z0-9._]+)', post_url)
                        if match:
                            username = match.group(1)
                            
                        # Extraer texto del post
                        post_text = ""
                        try:
                            post_text = page.evaluate("""
                                () => {
                                    const article = document.querySelector('article');
                                    if (article) {
                                        const textSpans = article.querySelectorAll('span, div');
                                        let longestText = '';
                                        for (const span of textSpans) {
                                            const txt = (span.textContent || '').trim();
                                            if (txt.length > longestText.length && !txt.includes('likes') && !txt.includes('replies') && txt.length < 500) {
                                                longestText = txt;
                                            }
                                        }
                                        return longestText;
                                    }
                                    return document.title || '';
                                }
                            """)
                        except Exception as e:
                            print(f"    ⚠️ No se pudo extraer texto del post: {e}")
                            
                        phrase = generate_dynamic_comment(username, post_text)
                        commented = False
                        
                        # Paso 1: Activar/abrir la caja de comentarios haciendo click en el botón de Reply/Responder
                        print("    🔍 Buscando disparador de respuesta/comentario...")
                        trigger_result = page.evaluate("""
                            () => {
                                let boxes = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
                                for (const b of boxes) {
                                    const rect = b.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0) {
                                        b.focus();
                                        return { success: true, method: 'already_visible' };
                                    }
                                }

                                const searchTerms = ['responder', 'reply', 'comentar', 'comment', 'respuesta', 'escribir'];
                                const buttons = Array.from(document.querySelectorAll('button, [role="button"], a, svg, path'));
                                
                                let replyButton = null;
                                for (const el of buttons) {
                                    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                                    const text = (el.textContent || el.innerText || '').toLowerCase().trim();
                                    const title = (el.getAttribute('title') || '').toLowerCase();
                                    
                                    if (searchTerms.some(term => ariaLabel.includes(term) || text.includes(term) || title.includes(term))) {
                                        let clickable = el;
                                        while (clickable && clickable !== document.body) {
                                            if (clickable.tagName === 'BUTTON' || clickable.getAttribute('role') === 'button' || clickable.tagName === 'A') {
                                                replyButton = clickable;
                                                break;
                                            }
                                            clickable = clickable.parentElement;
                                        }
                                        if (replyButton) break;
                                    }
                                }

                                if (!replyButton) {
                                    const svgs = document.querySelectorAll('svg');
                                    for (const svg of svgs) {
                                        let parent = svg.parentElement;
                                        while (parent && parent !== document.body) {
                                            if (parent.tagName === 'BUTTON' || parent.getAttribute('role') === 'button') {
                                                const label = (parent.getAttribute('aria-label') || '').toLowerCase();
                                                if (label.includes('reply') || label.includes('respond') || label.includes('comentar')) {
                                                    replyButton = parent;
                                                    break;
                                                }
                                            }
                                            parent = parent.parentElement;
                                        }
                                        if (replyButton) break;
                                    }
                                }

                                if (replyButton) {
                                    replyButton.click();
                                    return { success: true, method: 'clicked_reply_button' };
                                }

                                const divs = Array.from(document.querySelectorAll('div, span, p'));
                                for (const d of divs) {
                                    const text = d.textContent || '';
                                    if (text.includes('Reply to') || text.includes('Responder a') || text.includes('Comenta a') || text.includes('Reply...')) {
                                        let clickable = d;
                                        while (clickable && clickable !== document.body) {
                                            if (clickable.tagName === 'BUTTON' || clickable.getAttribute('role') === 'button') {
                                                clickable.click();
                                                return { success: true, method: 'clicked_placeholder_parent' };
                                            }
                                            clickable = clickable.parentElement;
                                        }
                                        d.click();
                                        return { success: true, method: 'clicked_placeholder_self' };
                                    }
                                }

                                return { success: false, reason: 'no_reply_trigger_found' };
                            }
                        """)
                        
                        print(f"    👉 Resultado de disparador: {trigger_result}")
                        page.wait_for_timeout(random.randint(1500, 2500))
                        
                        # Paso 2: Localizar y enfocar la caja de texto
                        editor_focused = page.evaluate("""
                            () => {
                                if (globalThis.playwriterPinnedElem1) {
                                    globalThis.playwriterPinnedElem1.focus();
                                    return true;
                                }
                                const boxes = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
                                for (const b of boxes) {
                                    const rect = b.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0) {
                                        b.focus();
                                        return true;
                                    }
                                }
                                return false;
                            }
                        """)
                        
                        if editor_focused:
                            print(f"    ✍️ Escribiendo comentario en el post: \"{phrase[:50]}...\"")
                            page.wait_for_timeout(random.randint(600, 1200))
                            human_type_fast(page, phrase)
                            page.wait_for_timeout(random.randint(800, 1400))
                            
                            # Paso 3: Publicar comentario presionando Control+Enter
                            print("    🚀 Publicando comentario presionando Control+Enter...")
                            page.keyboard.press("Control+Enter")
                            page.wait_for_timeout(2500)
                            
                            # Verificar si el editor sigue visible
                            editor_still_visible = page.evaluate("""
                                () => {
                                    const boxes = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
                                    for (const b of boxes) {
                                        const rect = b.getBoundingClientRect();
                                        if (rect.width > 0 && rect.height > 0) return true;
                                    }
                                    return false;
                                }
                            """)
                            
                            send_clicked = None
                            if editor_still_visible:
                                print("    ⚠️ El editor sigue visible. Ctrl+Enter no publicó el comentario. Buscando botón de publicar...")
                                send_clicked = page.evaluate("""
                                    () => {
                                        if (globalThis.playwriterPinnedElem2) {
                                            globalThis.playwriterPinnedElem2.click();
                                            return 'pinned2';
                                        }
                                        
                                        const dialog = document.querySelector('[role="dialog"]');
                                        const scope = dialog || document;
                                        const buttons = [...scope.querySelectorAll('button, [role="button"]')];
                                        const allowedWords = ['publicar', 'post', 'enviar', 'send', 'reply', 'responder', 'compartir', 'share'];
                                        
                                        for (const btn of buttons) {
                                            const text = (btn.textContent || btn.innerText || '').trim().toLowerCase();
                                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                            
                                            if (allowedWords.some(word => text === word || ariaLabel.includes(word))) {
                                                const disabledAttr = btn.getAttribute('disabled');
                                                const isDisabled = disabledAttr !== null && disabledAttr !== 'false';
                                                
                                                if (!isDisabled) {
                                                    btn.click();
                                                    return 'text_button_' + (dialog ? 'in_dialog' : 'in_page') + '_' + text;
                                                }
                                            }
                                        }
                                        
                                        if (dialog) {
                                            const dialogButtons = [...dialog.querySelectorAll('button, [role="button"]')];
                                            for (const btn of dialogButtons) {
                                                const text = (btn.textContent || '').trim().toLowerCase();
                                                if (text && !text.includes('cancelar') && !text.includes('cancel') && !text.includes('cerrar') && !text.includes('close')) {
                                                    btn.click();
                                                    return 'dialog_fallback_button_' + text;
                                                }
                                            }
                                        }
                                        return null;
                                    }
                                """)
                            else:
                                send_clicked = 'ctrl_enter'
                                
                            if send_clicked:
                                print(f"    ✅ Comentario publicado exitosamente (estrategia: {send_clicked}).")
                                page.wait_for_timeout(2000)
                                save_commented_post(post_url, commented_posts)
                                success_count += 1
                                commented = True
                            else:
                                print("    ⚠️ No se encontró botón de enviar habilitado. Intentando con Enter simple...")
                                page.keyboard.press("Enter")
                                page.wait_for_timeout(2000)
                                save_commented_post(post_url, commented_posts)
                                success_count += 1
                                commented = True
                        else:
                            print("    ⚠️ No se encontró la caja de texto editable en este post.")
                        
                        if commented:
                            report_lead_to_crm(post_url, phrase)
                            commented_in_this_cycle = True
                            posts_commented_this_feed += 1
                            
                            if posts_commented_this_feed >= max_posts_per_feed:
                                print(f"    ✨ Meta de {posts_commented_this_feed} post(s) alcanzada en esta sección. Rotando a nuevo contenido...")
                                human_pause = random.randint(12, 22)
                                print(f"    ☕ Pausa natural ({human_pause}s) antes de rotar de tema...")
                                time.sleep(human_pause)
                                break
                            else:
                                print(f"    🔄 Volviendo al feed ({source_label}) para explorar el siguiente post...")
                                try:
                                    page.goto(current_url)
                                    page.wait_for_timeout(2000)
                                    smooth_human_scroll(page, num_scrolls=2)
                                except Exception as nav_e:
                                    print(f"    ⚠️ Error volviendo al feed: {nav_e}")
                                human_pause = random.randint(10, 18)
                                print(f"    ☕ Pausa natural entre posts ({human_pause}s)...")
                                time.sleep(human_pause)
                            
                    except Exception as e:
                        print(f"    ❌ Error procesando el post individual: {e}")
                
                # Si terminamos toda la lista de posts sin haber comentado nada nuevo
                if not commented_in_this_cycle:
                    print("  💤 No se comentaron publicaciones nuevas en este ciclo. Esperando 15s antes del próximo refresh de feed...")
                    page.wait_for_timeout(15000)
                    
            except Exception as e:
                print(f"❌ Error en el ciclo de escaneo del feed: {e}")
                consecutive_failures += 1
                if consecutive_failures > 5:
                    print("❌ Demasiados errores consecutivos. Abortando navegador...")
                    break
                page.wait_for_timeout(10000)
                
        browser.close()
        
    print("\n" + "=" * 60)
    print(f"🎉 EJECUCIÓN COMPLETADA")
    print(f"Total invitaciones exitosas: {success_count}")
    print(f"Posts únicos comentados total: {len(commented_posts)}")
    print("=" * 60)

# ─── Main Entrypoint ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Threads Automated Outreach & Marketing Bot")
    parser.add_argument("--tags", nargs="+", default=[
        "trading", "crypto", "cripto", "oro", "forex", "nasdaq", "xauusd", "nq100",
        "daytrading", "swingtrading", "scalping", "bitcointrading", "criptomonedas",
        "tradingview", "analisistecnico", "mercadofinanciero", "bolsa", "inversiones",
        "futuros", "indices", "sp500", "eurusd", "gbpusd", "forextrading",
        "tradingmotivation", "psicotrading", "gestionderiesgo", "priceaction"
    ],
                        help="Etiquetas de búsqueda en Threads sin el símbolo #")
    parser.add_argument("--limit", type=int, default=5, help="Límite de interacciones por etiqueta")
    parser.add_argument("--interactive", action="store_true", help="Iniciar sesión e interactuar manualmente para guardar cookies")
    parser.add_argument("--dry-run", action="store_true", help="Simula las acciones y muestra comentarios sin publicarlos en vivo")
    parser.add_argument("--live", action="store_true", help="Activa la publicación real en Threads")
    args = parser.parse_args()
    
    if args.interactive:
        run_interactive_login()
    else:
        dry_run = not args.live
        if not dry_run:
            print("⏳ [DAEMON 24/7] Iniciando en bucle continuo de prospección...")
            while True:
                try:
                    run_bot(args.tags, args.limit, dry_run=False)
                except Exception as e:
                    print(f"⚠️ Error en ciclo de outreach: {e}")
                
                # Descanso natural de navegación entre rondas de interacción (3 a 6 minutos)
                rest_minutes = random.randint(3, 6)
                print(f"💤 Ciclo finalizado con éxito. Pausa natural de {rest_minutes} minutos antes de la siguiente ronda...")
                time.sleep(rest_minutes * 60)
        else:
            run_bot(args.tags, args.limit, dry_run=True)

if __name__ == "__main__":
    main()
