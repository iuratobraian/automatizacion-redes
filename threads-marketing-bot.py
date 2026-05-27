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

# ─── 50 Frases de Invitación Únicas y Variadas (Evita Filtros de Spam) ─────────
INVITATION_PHRASES = [
    "¡Excelente contenido de trading! 📈 Si quieres compartir setups de forma profesional, te invito a sumarte a TradeShare, nuestra red social exclusiva de traders.",
    "¡Muy buen análisis! 📊 En TradeShare compartimos ideas y operamos en tiempo real con una comunidad global de traders. Te esperamos en la plataforma.",
    "¡Qué buen setup de trading! 🚀 Justo de esto hablábamos hoy en TradeShare. Únete gratis para ver más ideas exclusivas y conectar con otros profesionales.",
    "Gran enfoque. 💡 Si buscas un espacio sin ruido ni bots para hablar de mercados financieros, TradeShare es el lugar ideal para traders de tu nivel.",
    "¡Interesante perspectiva! En TradeShare tenemos canales dedicados a Forex y Crypto donde analizamos esto diariamente de forma limpia y transparente.",
    "Buen timing en este post. 📉 Te invito a TradeShare, la primera comunidad hecha por y para traders, con herramientas premium gratis para registrar tu bitácora.",
    "Totalmente de acuerdo con tu análisis. 🎯 Comparto ideas similares en TradeShare. Deberías sumarte, hay un feedback increíble entre los miembros.",
    "¡Impecable visión del mercado! 🌟 Si quieres expandir tu red de contactos en el mundo del trading profesional, visítanos en TradeShare. ¡Te va a encantar!",
    "¡Brutal la info! 🔥 En TradeShare estamos armando el ecosistema definitivo para traders de habla hispana. ¡Únete y aporta tu granito de arena!",
    "Me gusta cómo analizas los charts. 📈 Te invito a crear tu bitácora de trading gratis en TradeShare y compartir tu evolución con la comunidad.",
    "¡Qué buen gráfico! 📊 Si buscas feedback de traders fondeados y expertos del sector, TradeShare es nuestra red exclusiva. ¡Te esperamos!",
    "Gran aporte para la comunidad. 🙌 Te invito a TradeShare, un espacio diseñado exclusivamente para traders profesionales libre de spam y estafas.",
    "Excelente lectura de la acción del precio. 🚀 En TradeShare compartimos setups y analizamos en vivo diariamente. ¡Súmate a la red global!",
    "Muy buen post. 💡 En TradeShare nos enfocamos en el crecimiento mutuo sin el ruido típico de otras redes. Date una vuelta por la plataforma.",
    "¡Espectacular visión! 🎯 Si quieres llevar tu trading al siguiente nivel y conectar con otros profesionales de verdad, súmate gratis a TradeShare.",
    "¡Muy de acuerdo! 📈 Justo hoy analizábamos ese mismo patrón en TradeShare. La comunidad aporta muchísimo valor todos los días.",
    "Me encanta este análisis técnico. 📊 Si te interesa el trading transparente y las estadísticas reales, te invito a conocer TradeShare hoy.",
    "¡Directo al grano! 🚀 Te invito a compartir tus ideas y setups en TradeShare, la red social premium donde nos apoyamos entre traders.",
    "Buenísimo el contenido. 💡 Si estás buscando partners de trading y una comunidad transparente, TradeShare te va a sorprender gratamente.",
    "¡Tremendo setup! 📉 Justo lo que necesitamos en la comunidad global de TradeShare. Estás más que invitado a sumarte con nosotros.",
    "Me gusta mucho tu enfoque de gestión de riesgo. 🛡️ En TradeShare premiamos la consistencia y la educación real. ¡Date una vuelta!",
    "Gran post. 📈 Si buscas herramientas de trading avanzadas y una bitácora pública auditada, te esperamos con los brazos abiertos en TradeShare.",
    "¡Un análisis muy fino! 📊 Únete a TradeShare para conectar directamente con más de mil traders activos compartiendo análisis en tiempo real.",
    "¡Excelente post! 🚀 TradeShare es el punto de encuentro ideal para personas que aman los mercados tanto como tú. ¡Te esperamos gratis!",
    "¡Coincido plenamente! 💡 En TradeShare buscamos elevar el nivel de debate sobre trading. Te invito a formar parte de este gran ecosistema.",
    "¡Qué buena publicación! 📉 Únete a nuestra red exclusiva de trading en TradeShare y accede a canales premium de debate y charts interactivos.",
    "¡Muy buen chart! 📈 TradeShare es la red social donde compartimos ideas de inversión sin humo ni bots. ¡Regístrate gratis hoy mismo!",
    "¡Me gusta la explicación! 📊 En TradeShare organizamos discusiones diarias sobre Forex, Índices y Crypto. Te invito a sumarte.",
    "Gran aporte. 🚀 Te invito a TradeShare, donde conectamos a traders de todos los niveles para compartir setups de forma profesional.",
    "¡Fascinante lectura! 💡 Únete a TradeShare, la plataforma global que está revolucionando la forma en que los traders se comunican y colaboran.",
    "¡Exactamente! 📉 Si quieres tener tu propio espacio y bitácora de trading con reputación transparente, visítanos en la red social TradeShare.",
    "Muy buen análisis de mercado. 📈 Te invito a compartir este tipo de setups en TradeShare, la comunidad que valora el análisis técnico real.",
    "¡Excelente contenido! 📊 TradeShare es el lugar perfecto para traders consistentes que quieren compartir conocimientos sin interferencias.",
    "¡Totalmente! 🚀 Si buscas un espacio serio para debatir sobre la sesión del día, te esperamos en la red social TradeShare.",
    "¡Gran setup de trading! 💡 En TradeShare tenemos un canal especial de ideas operativas donde este análisis encajaría de forma excelente.",
    "¡Un enfoque muy profesional! 📈 Te invito a sumarte a TradeShare, la red exclusiva donde los traders crecemos y colaboramos en equipo.",
    "¡Muy buen post! 📊 TradeShare te permite llevar tu bitácora y recibir feedback de una comunidad sumamente activa. ¡Te esperamos!",
    "¡Increíble la precisión! 🎯 Únete a TradeShare para interactuar con traders profesionales en nuestro portal interactivo.",
    "¡Excelente perspectiva de mercado! 🚀 Te invito a TradeShare, la plataforma de trading social más transparente y completa.",
    "¡Brutal análisis técnico! 💡 Te esperamos en la red social TradeShare para debatir este setup y muchos otros en tiempo real.",
    "¡Me gusta mucho este setup! 📈 Si quieres ver más análisis y compartir los tuyos de manera profesional, te invito a sumarte a TradeShare.",
    "¡Lectura impecable! 📊 Sumate gratis a TradeShare, la red donde los traders compartimos setups diarios y herramientas interactivas.",
    "¡Excelente post! 🚀 Únete a la comunidad de TradeShare, donde fomentamos el trading responsable y transparente sin ruido de fondo.",
    "¡Gran gráfico! 💡 En TradeShare compartimos análisis y operamos juntos todos los días. Te invito a unirte a nuestra red social de traders.",
    "¡Muy de acuerdo con tu análisis de hoy! 📈 Si buscas una red social exclusiva de mercados financieros libres de bots, TradeShare te espera.",
    "¡Muy clara la explicación! 📊 Sumate a TradeShare para crear tu perfil de trader y conectar con cientos de inversores en español.",
    "¡Impresionante análisis técnico! 🚀 Te invito a sumarte a la red social de TradeShare y participar del ranking global de traders.",
    "¡Buenísima perspectiva de trading! 💡 Únete a TradeShare para debatir este y otros setups en canales especializados de Forex y Crypto.",
    "¡Un post de mucho valor! 📈 Te invito a TradeShare, la red exclusiva para traders que quieren conectar y compartir análisis profesionales.",
    "¡Muy buen setup! 📊 Nos encantaría debatir esta idea técnica en la comunidad global de TradeShare. ¡Sumate gratis hoy!"
]

# ─── Bot Logic ────────────────────────────────────────────────────────────────

def get_random_phrase() -> str:
    return random.choice(INVITATION_PHRASES)

def human_type(element, text: str):
    """Simula tipeo humano con retrasos aleatorios."""
    for char in text:
        element.type(char)
        time.sleep(random.uniform(0.05, 0.15))

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
    
    SEARCH_URL = "https://www.threads.net/search?q=analisis%20trading&serp_type=default"
    
    with sync_playwright() as p:
        browser, context = setup_browser(p, interactive=False)
        page = context.new_page()
        
        consecutive_failures = 0
        
        while success_count < limit:
            print(f"\n🔍 Cargando Página de Búsqueda de Threads ({SEARCH_URL})...")
            try:
                page.goto(SEARCH_URL)
                page.wait_for_timeout(random.randint(4000, 6000))
                
                # Scroll profundo para cargar publicaciones frescas
                print("  📜 Realizando scrolls para cargar resultados de búsqueda...")
                for scroll_i in range(8):
                    page.mouse.wheel(0, 1200)
                    page.wait_for_timeout(random.randint(2000, 4000))
                    if scroll_i % 3 == 2:
                        current_posts = len(page.query_selector_all("a[href*='/post/']"))
                        print(f"    📜 Scroll {scroll_i + 1}/8 — {current_posts} posts cargados")
                
                # Buscar enlaces de posts en la página
                post_links = []
                elements = page.query_selector_all("a[href*='/post/']")
                for el in elements:
                    href = el.get_attribute("href")
                    if href and "/post/" in href:
                        full_url = "https://www.threads.net" + href if href.startswith("/") else href
                        if full_url not in post_links:
                            post_links.append(full_url)
                
                print(f"  ✓ Encontradas {len(post_links)} publicaciones en el feed.")
                
                if not post_links:
                    print("  ⚠️ No se cargó ningún post. Esperando 10s para reintentar...")
                    page.wait_for_timeout(10000)
                    continue
                
                # Buscar un post elegible para comentar
                commented_in_this_cycle = False
                for post_url in post_links:
                    # Normalizar la URL antes de verificar si ya está comentada
                    norm_url = post_url.split('?')[0] if '?' in post_url else post_url
                    
                    if norm_url in commented_posts:
                        continue
                        
                    print(f"  👉 Procesando post: {post_url}")
                    
                    if dry_run:
                        phrase = get_random_phrase()
                        print(f"    [DRY RUN] Comentario a enviar: \"{phrase}\"")
                        save_commented_post(post_url, commented_posts)
                        success_count += 1
                        commented_in_this_cycle = True
                        break
                        
                    try:
                        # Ir al post individual
                        page.goto(post_url)
                        page.wait_for_timeout(random.randint(3000, 5000))
                        
                        phrase = get_random_phrase()
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
                            page.wait_for_timeout(random.randint(800, 1500))
                            page.keyboard.type(phrase, delay=random.randint(40, 80))
                            page.wait_for_timeout(random.randint(1000, 1500))
                            
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
                            
                            # Al finalizar el comentario con éxito, volver inmediatamente al feed de búsqueda sin cliquear nada más en el post
                            print("    🚀 Comentario enviado con éxito. Volviendo inmediatamente a la página de búsqueda para protección anti-spam...")
                            try:
                                page.goto(SEARCH_URL)
                                page.wait_for_timeout(2000)
                            except Exception as nav_e:
                                print(f"    ⚠️ Error volviendo a la página de búsqueda: {nav_e}")
                            
                            # Espera de protección contra spam (20 a 50 segundos) en la página del feed/búsqueda
                            sleep_time = random.randint(20, 50)
                            print(f"    💤 Esperando {sleep_time}s para protección anti-bloqueo en la página de búsqueda...")
                            time.sleep(sleep_time)
                            break
                            
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
                
                # Descanso largo de protección entre sweeps completos de etiquetas (10 a 15 minutos)
                rest_minutes = random.randint(10, 15)
                print(f"💤 Ciclo finalizado. Descansando {rest_minutes} minutos para simular comportamiento humano natural...")
                time.sleep(rest_minutes * 60)
        else:
            run_bot(args.tags, args.limit, dry_run=True)

if __name__ == "__main__":
    main()
