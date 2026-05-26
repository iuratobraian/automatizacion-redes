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

def setup_browser(p, interactive=False):
    """Inicializa el navegador conectándose a Playwriter (CDP) o con fallback local."""
    browser = None
    context = None
    try:
        print("🔗 Intentando conectar a Playwriter (CDP en puerto 19988)...")
        browser = p.chromium.connect_over_cdp("http://127.0.0.1:19988")
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

def run_bot(tags: list, limit_per_tag: int, dry_run: bool):
    """Ejecuta el bot automatizado por etiquetas."""
    print("=" * 60)
    print(f"🤖 INICIANDO OUTREACH BOT EN THREADS — {'[DRY RUN]' if dry_run else '[LIVE MODE]'}")
    print(f"Etiquetas a procesar: {', '.join(tags)}")
    print(f"Límite de interacciones por etiqueta: {limit_per_tag}")
    print("=" * 60)
    
    success_count = 0
    
    # Cargar registro de posts ya comentados (anti-ban)
    commented_posts = load_commented_posts()
    print(f"📋 Registro anti-ban: {len(commented_posts)} posts ya comentados previamente.")
    
    with sync_playwright() as p:
        browser, context = setup_browser(p, interactive=False)
        page = context.new_page()
        
        for tag in tags:
            tag_url = f"https://www.threads.net/search?q=%23{tag}"
            print(f"\n🔍 Buscando publicaciones para etiqueta: #{tag}...")
            
            try:
                # Prioridad 0: Clic prioritario en el botón Buscar pinneado
                search_clicked = page.evaluate("() => { if (globalThis.playwriterPinnedElem4) { globalThis.playwriterPinnedElem4.click(); return true; } return false; }")
                if search_clicked:
                    print("  ✓ Clic en botón Buscar pinneado (playwriterPinnedElem4).")
                    page.wait_for_timeout(3000)
                    # Encontrar el cuadro de búsqueda y escribir la etiqueta
                    search_input = page.query_selector("input[placeholder*='Buscar'], input[placeholder*='Search']")
                    if search_input:
                        search_input.click()
                        search_input.fill(f"#{tag}")
                        page.keyboard.press("Enter")
                        page.wait_for_timeout(random.randint(4000, 6000))
                else:
                    page.goto(tag_url)
                    page.wait_for_timeout(random.randint(4000, 6000))
                
                # Scroll para cargar posts
                for _ in range(3):
                    page.mouse.wheel(0, 800)
                    page.wait_for_timeout(random.randint(1500, 3000))
                
                # Buscar enlaces de posts en la página
                post_links = []
                elements = page.query_selector_all("a[href*='/post/']")
                for el in elements:
                    href = el.get_attribute("href")
                    if href and "/post/" in href:
                        full_url = "https://www.threads.net" + href if href.startswith("/") else href
                        if full_url not in post_links:
                            post_links.append(full_url)
                            
                print(f"  ✓ Encontradas {len(post_links)} publicaciones de #{tag}")
                
                processed = 0
                for post_url in post_links:
                    if processed >= limit_per_tag:
                        break
                    
                    # Normalizar la URL antes de verificar si ya está comentada
                    norm_url = post_url.split('?')[0] if '?' in post_url else post_url
                    
                    # ✅ ANTI-BAN: Saltar posts ya comentados
                    if norm_url in commented_posts:
                        print(f"  ⏭️ Salteando {norm_url[:60]}... (ya comentado anteriormente)")
                        continue
                        
                    print(f"  👉 Procesando post: {post_url}")
                    
                    if dry_run:
                        phrase = get_random_phrase()
                        print(f"    [DRY RUN] Comentario a enviar: \"{phrase}\"")
                        processed += 1
                        success_count += 1
                        time.sleep(1)
                        continue
                        
                    try:
                        # Ir al post individual
                        page.goto(post_url)
                        page.wait_for_timeout(random.randint(3000, 5000))
                        
                        phrase = get_random_phrase()
                        commented = False
                        
                        # ESTRATEGIA 1: Escribir directamente en la caja de texto del hilo
                        # (SIN apretar botón de comentar — simplemente se escribe directo)
                        editor_focused = page.evaluate("""
                            () => {
                                // Intentar enfocar usando el pinneado
                                if (globalThis.playwriterPinnedElem1) {
                                    globalThis.playwriterPinnedElem1.focus();
                                    return true;
                                }
                                // Fallback: buscar contenteditable en la página
                                const boxes = document.querySelectorAll('[contenteditable="true"], [role="textbox"]');
                                for (const b of boxes) {
                                    if (!b.closest('[role="dialog"]')) { // no en modales
                                        b.focus();
                                        return true;
                                    }
                                }
                                return false;
                            }
                        """)
                        
                        if editor_focused:
                            print(f"    ✍️ Escribiendo comentario directamente en el hilo: \"{phrase[:50]}...\"")
                            # Pequeña pausa antes de escribir (simula lectura)
                            page.wait_for_timeout(random.randint(800, 1500))
                            page.keyboard.type(phrase, delay=random.randint(40, 80))
                            page.wait_for_timeout(random.randint(1200, 2000))
                            
                            # ESTRATEGIA ENVIAR: usar playwriterPinnedElem2 (botón Publicar/Enviar)
                            send_clicked = page.evaluate("""
                                () => {
                                    // Prioridad: elemento pinneado del usuario (botón Publicar en Threads)
                                    if (globalThis.playwriterPinnedElem2) {
                                        globalThis.playwriterPinnedElem2.click();
                                        return 'pinned2';
                                    }
                                    // Fallback: buscar botón de publicar/post visible
                                    const buttons = [...document.querySelectorAll('button, [role="button"]')];
                                    for (const btn of buttons) {
                                        const text = (btn.textContent || btn.innerText || '').trim().toLowerCase();
                                        if (text === 'publicar' || text === 'post' || text === 'enviar' || text === 'send') {
                                            btn.click();
                                            return 'text_button';
                                        }
                                    }
                                    return null;
                                }
                            """)
                            
                            if send_clicked:
                                print(f"    ✅ Comentario publicado exitosamente (estrategia: {send_clicked}).")
                                page.wait_for_timeout(2000)
                                # Guardar como comentado para no repetir
                                save_commented_post(post_url, commented_posts)
                                success_count += 1
                                processed += 1
                                commented = True
                            else:
                                print("    ⚠️ No se encontró botón de enviar. Intentando con Enter...")
                                page.keyboard.press("Enter")
                                page.wait_for_timeout(2000)
                                save_commented_post(post_url, commented_posts)
                                success_count += 1
                                processed += 1
                                commented = True
                        else:
                            print("    ⚠️ No se encontró la caja de texto editable en este post.")
                        
                        if commented:
                            # Espera de protección contra spam (20 a 50 segundos)
                            sleep_time = random.randint(20, 50)
                            print(f"    💤 Esperando {sleep_time}s para protección anti-bloqueo...")
                            time.sleep(sleep_time)
                            
                    except Exception as e:
                        print(f"    ❌ Error procesando el post individual: {e}")
                        
            except Exception as e:
                print(f"❌ Error al buscar publicaciones de #{tag}: {e}")
                
        browser.close()
        
    print("\n" + "=" * 60)
    print(f"🎉 EJECUCIÓN COMPLETADA")
    print(f"Total invitaciones exitosas: {success_count}")
    print(f"Posts únicos comentados total: {len(commented_posts)}")
    print("=" * 60)

# ─── Main Entrypoint ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Threads Automated Outreach & Marketing Bot")
    parser.add_argument("--tags", nargs="+", default=["trading", "crypto", "cripto", "oro", "forex", "nasdaq", "xauusd", "nq100"],
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
