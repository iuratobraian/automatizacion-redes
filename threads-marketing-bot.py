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
from datetime import datetime

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

# ─── Biblioteca Temática Especializada y Contextual de Trading con Invitación Orgánica a TradeShare ───
TOPIC_COMMENTS_MAP = {
    "gold": [
        "El Oro (XAUUSD) cuando agarra volumen institucional en la sesión americana es implacable. En TradeShare (@tradeshare.ok) solemos debatir las barridas de Londres. ¿Prefieres operar la ruptura o el retroceso a descuento en NY?",
        "En XAUUSD las barridas de liquidez asiáticas son un clásico. Justo en la comunidad de TradeShare analizamos esas confluencias a diario. ¿Esperas confirmación en M1/M5 o entras con orden límite?",
        "Totalmente. El Oro tiene una velocidad y spread que no perdonan una mala gestión. En TradeShare usamos la Bitácora Pro gratuita para medir el drawdown exacto por sesión. ¡Gran lectura!",
        "Buena lectura en el Oro. Cuando el DXY hace divergencia con XAUUSD, los setups de absorción dan un R:R brutal. En TradeShare (trade-share.com) compartimos estos escenarios en vivo.",
        "El oro respetó la zona quirúrgicamente. ¿Mides el objetivo al pool de liquidez externa o tomas parciales rápidos? Te esperamos en TradeShare (@tradeshare.ok) para compartir el setup."
    ],
    "nasdaq_indices": [
        "En índices como el Nasdaq (NQ) los primeros 15 min de NY son de manipulación pura. En TradeShare solemos esperar las 10:00 AM para la tendencia limpia. ¿Sueles operar la apertura?",
        "Totalmente de acuerdo con esa zona en el Nasdaq. En la comunidad de TradeShare (@tradeshare.ok) monitoreamos la absorción con volumen en VWAP. ¿Mides el riesgo por puntos fijos o por ATR?",
        "El NQ se mueve con una volatilidad quirúrgica. En TradeShare (trade-share.com) tenemos herramientas para trackear métricas de futuros gratis. ¡Gran enfoque!",
        "Excelente análisis del índice. Cuando barren el rango de apertura y recuperan estructura, el target al FVG se cumple rápido. Súmate a debatir en TradeShare (@tradeshare.ok).",
        "Qué buen setup en futuros. Operar el retroceso tras la toma de liquidez da los mejores R:R. Te invito a compartir el trade en la Bitácora Pro de trade-share.com."
    ],
    "crypto": [
        "Muy buena estructura en Bitcoin. En la comunidad de TradeShare (trade-share.com) venimos siguiendo esos pools de liquidez en 4H. ¿Prefieres operar derivados perpetuos o spot?",
        "En cripto los fines de semana suelen dejar trampas de bajo volumen. En TradeShare (@tradeshare.ok) abrimos salas para analizar la sesión de Londres y NY los domingos por la tarde.",
        "Totalmente. Cuando el funding rate se sobrecalienta, el mercado barre apalancados antes de seguir la tendencia macro. Justo venimos advirtiendo esto en TradeShare.",
        "Gran lectura en BTC. La clave ahí es no dejarse llevar por el FOMO y esperar el retesteo claro de soporte. Los esperamos en TradeShare para compartir gráficos.",
        "Excelente perspectiva cripto. Mientras la dominancia de Bitcoin mantenga estructura, las altcoins van a seguir correlacionadas. Pasate por trade-share.com para ver más análisis."
    ],
    "prop_firms": [
        "La regla de oro en pruebas de fondeo: arriesgar máximo 0.5% por trade. En TradeShare (trade-share.com) creamos herramientas 100% gratuitas para blindar el drawdown diario. ¿Qué firma operas?",
        "Totalmente de acuerdo. En empresas de fondeo el mayor enemigo es la ansiedad por querer pasar el challenge rápido. En TradeShare (@tradeshare.ok) priorizamos el track record verificado.",
        "Muchos traders pierden cuentas fondeadas por buscar un día mágico en vez de aceptar un stop loss pequeño. En TradeShare ayudamos a traders a gestionar su riesgo profesionalmente.",
        "Exacto. En TradeShare (trade-share.com) siempre insistimos en que el capital psicológico vale más que pasar la fase en dos días. ¡Te felicito por el enfoque disciplinado!",
        "Gran enfoque para cuentas de fondeo. El secreto de los retiros constantes no es meter 5 trades al día, sino esperar el setup A+. Súmate a la comunidad de TradeShare."
    ],
    "psychology": [
        "Totalmente de acuerdo. Las pérdidas pequeñas son costos operativos de un negocio rentable; el problema empieza cuando el ego se niega al stop loss. En TradeShare fomentamos esa mentalidad.",
        "Cerrar la pantalla cuando se cumple el plan del día separa a los consistentes del 95% que sobreopera. En la comunidad de TradeShare (@tradeshare.ok) compartimos esta regla como ley.",
        "El 90% del trading es psicológico. Cuando registras cada trade en la Bitácora Pro de TradeShare (gratis en trade-share.com), las decisiones por revancha desaparecen por completo.",
        "La paciencia aburrida paga infinitamente más que la adrenalina. Gran recordatorio de disciplina mental para toda la comunidad. ¡Te esperamos en TradeShare!",
        "Excelente reflexión. El mercado no te debe nada: aceptar la incertidumbre es el quiebre hacia la consistencia. Te invito a registrar tus trades en trade-share.com."
    ],
    "price_action_smc": [
        "Gran lectura del gráfico. En TradeShare (@tradeshare.ok) compartimos análisis de Order Blocks y FVG a diario. ¿Sueles esperar confirmación de CHoCH en M5 o entras por límite?",
        "Muy buen análisis de la acción del precio. Los retrocesos al FVG con mitigación en sesión de NY suelen dar las mejores confirmaciones. ¡Pasate por trade-share.com a ver más ideas!",
        "Impecable el mapeo de liquidez. En la comunidad de TradeShare venimos debatiendo justo cómo filtrar los fakeouts de Londres en divisas y metales.",
        "Buena proyección. El quiebre con cuerpo de vela en H1 valida mucho mejor la continuidad del sesgo que una mecha. Te invito a compartir tus análisis en TradeShare (@tradeshare.ok).",
        "Totalmente de acuerdo con esa zona de oferta. Si entra volumen institucional en esa confluencia, el R:R es excelente. Súmate a TradeShare para conectar con más traders."
    ],
    "indicators": [
        "Un gráfico limpio de acción del precio siempre te dará la señal antes que cualquier indicador rezagado. En TradeShare promovemos gráficos limpios y gestión sólida. ¿Usas filtros de confluencia?",
        "Totalmente. Las divergencias en RSI o MACD solo funcionan con alta probabilidad cuando coinciden con zonas mayores de oferta o demanda. Justo lo analizamos en TradeShare (@tradeshare.ok).",
        "Menos es más en la pantalla. Cuando eliminas el exceso de indicadores y te enfocas en volumen y liquidez, la claridad cambia radicalmente. Te invitamos a la comunidad de trade-share.com.",
        "Gran punto. Los indicadores son solo herramientas de confirmación estadística, el verdadero disparador lo dicta la estructura. ¡Excelente aporte de valor para la comunidad!"
    ],
    "forex": [
        "Interesante visión del par. El solapamiento de Londres y Nueva York suele desbloquear la direccionalidad del día en Forex. En TradeShare (@tradeshare.ok) seguimos la sesión en vivo.",
        "Muy fino el análisis en divisas. En temporalidades de H1 los pools de liquidez externa son los mejores objetivos para parciales. Te esperamos en trade-share.com para compartir setups.",
        "Excelente lectura del EURUSD. La correlación inversa con el DXY dio una confluencia muy limpia en esa zona. Gran trabajo de análisis, te invito a sumarte a TradeShare.",
        "Buena cautela en Forex. En días de bancos centrales o tasas de interés, mantenerse fuera es la decisión más profesional. En TradeShare compartimos ese enfoque prudente."
    ],
    "general": [
        "Pregunta para debatir: ¿prefieren operar con stop loss fijo en pips/puntos o siempre adaptado al último swing? En TradeShare (@tradeshare.ok) estamos debatiendo justo esto.",
        "Interesante punto de vista. ¿Qué porcentaje de efectividad tienes testeado en este patrón con tu bitácora de trading? En TradeShare tenemos Bitácora Pro 100% gratuita.",
        "Gran debate: ¿operar las noticias de alto impacto o quedarse fuera para evitar deslizamientos de spread? Los esperamos en trade-share.com para seguir el debate con la comunidad.",
        "¿Qué temporalidad consideras tu 'timeframe maestro' para definir el sesgo de la sesión? Buen post. Te invito a conocer TradeShare (@tradeshare.ok).",
        "Totalmente. El mejor trade de la semana muchas veces es aquel que decidiste NO tomar por falta de confluencias. Te felicitamos desde TradeShare por este contenido de valor.",
        "Brutal análisis. Da gusto encontrar contenido técnico real sin el típico humo de las redes. Te invitamos a sumarte a TradeShare (trade-share.com) para compartir tus ideas."
    ]
}

TOPIC_REGEX_PATTERNS = {
    "gold": r'\b(oro|xauusd|xau|gold|metales|plata|xag)\b',
    "nasdaq_indices": r'\b(nasdaq|nq|nq100|sp500|dow|us30|indices|índices|futuros|apertura ny|wall street|futures|s&p|\bes\b)\b',
    "crypto": r'\b(btc|bitcoin|eth|ethereum|crypto|cripto|halving|altcoins?|solana|satoshi|binance)\b',
    "prop_firms": r'\b(fondeo|prop firms?|propfirm|drawdowns?|ftmo|myff|funding|challenges?|fase 1|fase 2|regla diaria)\b',
    "psychology": r'\b(psicolog\w*|psicotrading|emocion\w*|fomo|miedo|ego|paciencia|revancha|tilt|sobreoper\w*|disciplina|consistencia|stop loss|pérdidas?|perdidas?|mentalidad)\b',
    "indicators": r'\b(indicador\w*|rsi|macd|medias? m[oó]vil\w*|emas?|sma|bollinger|cruce)\b',
    "forex": r'\b(forex|eurusd|gbpusd|usdjpy|divisas?|dxy|pips?|londres)\b',
    "price_action_smc": r'\b(liquidez|fvg|order blocks?|\bob\b|bos|choch|imbalances?|retroceso|fibonacci|confluencia|soportes?|resistencias?|estructura)\b'
}

def classify_post_topic(post_text: str) -> str:
    """Clasifica el tema del post mediante keywords regex para responder con total coherencia técnica."""
    t = (post_text or "").lower()
    for topic, pattern in TOPIC_REGEX_PATTERNS.items():
        if re.search(pattern, t):
            return topic
    return "general"

def get_contextual_trading_comment(post_text: str) -> str:
    """Devuelve un comentario 100% coherente y alineado con el tema del post invitando a TradeShare."""
    topic = classify_post_topic(post_text)
    pool = TOPIC_COMMENTS_MAP.get(topic, TOPIC_COMMENTS_MAP["general"])
    chosen = random.choice(pool)
    print(f"    🎯 Clasificación temática: [{topic.upper()}] -> Comentario alineado con invitación a TradeShare.")
    return chosen

def generate_dynamic_comment(username: str, post_text: str) -> str:
    """Consulta la API de IA local para generar un comentario estrictamente relevante al post invitando a TradeShare."""
    api_url = "http://localhost:5680/api/ai/chat"
    topic = classify_post_topic(post_text)
    try:
        clean_user = username.replace("@", "").strip()
        system_instruction = (
            f"Actúa como un trader experimentado, técnico y respetado en Threads. "
            f"El usuario @{clean_user} publicó: \"{post_text}\". "
            f"Tema detectado del post: {topic}. "
            f"Escribe un comentario breve (1 a 2 oraciones máximo) en español. "
            f"REGLA OBLIGATORIA: Tu respuesta DEBE hablar exactamente del tema del post ({topic}) aportando valor real "
            f"(liquidez, gestión de riesgo, confirmaciones o una pregunta constructiva para abrir debate) "
            f"e incluir una invitación sutil y orgánica a participar en la comunidad de TradeShare (@tradeshare.ok o trade-share.com) "
            f"o a registrar sus trades en la Bitácora Pro gratuita. "
            f"NO parezcas un bot vendedor, sé natural, amigable, técnico y profesional."
        )
        payload = { "message": system_instruction }
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            api_url, 
            data=data, 
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            if res_data.get("success") and res_data.get("reply"):
                clean_reply = res_data.get("reply").strip().replace('"', '')
                if len(clean_reply) > 15:
                    print(f"    🤖 IA Local generó respuesta contextual [{topic.upper()}]: \"{clean_reply[:60]}...\"")
                    return clean_reply
    except Exception as e:
        pass
    
    # Fallback garantizado: comentario clasificado por topic
    return get_contextual_trading_comment(post_text)

def human_type_fast(page, text: str):
    """Simula tipeo ultra veloz, fluido y natural (máximo rendimiento sin demoras)."""
    for char in text:
        page.keyboard.type(char)
        if char in ['.', ',', '?', '!', ':']:
            time.sleep(random.uniform(0.015, 0.035))
        elif char == ' ':
            time.sleep(random.uniform(0.008, 0.018))
        else:
            time.sleep(random.uniform(0.003, 0.008))

def smooth_human_scroll(page, num_scrolls=2):
    """Realiza scrolls rápidos y efectivos para navegar velozmente."""
    viewport = page.viewport_size or {"width": 1280, "height": 800}
    for i in range(num_scrolls):
        scroll_amount = random.randint(350, 600)
        page.mouse.wheel(0, scroll_amount)
        time.sleep(random.uniform(0.12, 0.28))

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
        
        # Manejador seguro de diálogos nativos para prevenir caídas de CDP
        def _safe_dialog_dismiss(dialog):
            try:
                dialog.dismiss()
            except Exception:
                pass
        page.on("dialog", _safe_dialog_dismiss)
        
        try:
            page.add_init_script("""
                window.addEventListener('beforeunload', (e) => {
                    e.stopImmediatePropagation();
                }, { capture: true });
                window.alert = () => {};
                window.confirm = () => true;
                window.prompt = () => null;
            """)
        except Exception:
            pass
        
        consecutive_failures = 0
        
        # Viral Boost: interactuar con hilos propios antes de prospectar
        if not dry_run:
            boost_own_threads(page, commented_posts)
        
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
                page.goto(current_url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(random.randint(500, 900))
                
                # Desplazamiento ultra veloz pero orgánico
                print("  📜 Navegando y leyendo feed a máxima velocidad...")
                smooth_human_scroll(page, num_scrolls=random.randint(1, 2))
                
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
                    page.wait_for_timeout(1000)
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
                        page.goto(post_url, wait_until="domcontentloaded", timeout=45000)
                        page.wait_for_timeout(random.randint(600, 1000))
                        
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
                        page.wait_for_timeout(random.randint(250, 450))
                        
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
                            page.wait_for_timeout(random.randint(80, 160))
                            human_type_fast(page, phrase)
                            page.wait_for_timeout(random.randint(100, 200))
                            
                            # Paso 3: Publicar comentario presionando Control+Enter
                            print("    🚀 Publicando comentario presionando Control+Enter...")
                            page.keyboard.press("Control+Enter")
                            page.wait_for_timeout(500)
                            
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
                                page.wait_for_timeout(400)
                                save_commented_post(post_url, commented_posts)
                                success_count += 1
                                commented = True
                            else:
                                print("    ⚠️ No se encontró botón de enviar habilitado. Intentando con Enter simple...")
                                page.keyboard.press("Enter")
                                page.wait_for_timeout(400)
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
                                human_pause = random.randint(2, 4)
                                print(f"    ⚡ Breve pausa ({human_pause}s) antes de rotar...")
                                time.sleep(human_pause)
                                break
                            else:
                                print(f"    🔄 Volviendo al feed ({source_label}) para explorar el siguiente post...")
                                try:
                                    page.goto(current_url, wait_until="domcontentloaded", timeout=45000)
                                    page.wait_for_timeout(350)
                                    smooth_human_scroll(page, num_scrolls=1)
                                except Exception as nav_e:
                                    print(f"    ⚠️ Error volviendo al feed: {nav_e}")
                                human_pause = random.randint(2, 4)
                                print(f"    ⚡ Breve pausa rápida ({human_pause}s)...")
                                time.sleep(human_pause)
                            
                    except Exception as e:
                        print(f"    ❌ Error procesando el post individual: {e}")
                
                # Si terminamos toda la lista de posts sin haber comentado nada nuevo
                if not commented_in_this_cycle:
                    print("  💤 No se comentaron publicaciones nuevas en este ciclo. Esperando 3s antes del próximo refresh de feed...")
                    page.wait_for_timeout(3000)
                    
            except Exception as e:
                err_str = str(e)
                print(f"❌ Error en el ciclo de escaneo del feed: {err_str}")
                if "Connection closed" in err_str or "Target closed" in err_str or "browser has been closed" in err_str:
                    print("🔌 Conexión con el navegador perdida o interrumpida. Cerrando ciclo para reconexión limpia...")
                    break
                consecutive_failures += 1
                if consecutive_failures > 5:
                    print("❌ Demasiados errores consecutivos. Abortando navegador...")
                    break
                time.sleep(3)
                
        try:
            if page:
                print("🧹 Cerrando pestaña de trabajo de Threads...")
                page.close()
        except Exception:
            pass
            
        try:
            browser.close()
        except Exception:
            pass
        
    print("\n" + "=" * 60)
    print(f"🎉 EJECUCIÓN COMPLETADA")
    print(f"Total invitaciones exitosas: {success_count}")
    print(f"Posts únicos comentados total: {len(commented_posts)}")
    print("=" * 60)

def boost_own_threads(page, commented_posts):
    """Revisa el perfil propio en Threads para responder a comentarios en hilos propios y viralizarlos."""
    try:
        print("\n🚀 [VIRAL BOOST] Verificando hilos propios en https://www.threads.net/@tradeshare.ok...")
        page.goto("https://www.threads.net/@tradeshare.ok", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1200)
        smooth_human_scroll(page, num_scrolls=1)
        
        post_links = []
        elements = page.query_selector_all("a[href*='/post/']")
        for el in elements:
            href = el.get_attribute("href")
            if href and "/post/" in href and "@tradeshare.ok" in href:
                full_url = "https://www.threads.net" + href if href.startswith("/") else href
                if full_url not in post_links:
                    post_links.append(full_url)
        
        if not post_links:
            print("  ℹ️ No se detectaron hilos propios recientes.")
            return
            
        latest_thread_url = post_links[0]
        print(f"  👉 Revisando hilo propio para engagement: {latest_thread_url}")
        page.goto(latest_thread_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1000)
        
        unanswered_replies = page.evaluate("""
            () => {
                const articles = Array.from(document.querySelectorAll('article'));
                if (articles.length > 1) {
                    for (let i = 1; i < articles.length; i++) {
                        const art = articles[i];
                        const text = (art.innerText || '').toLowerCase();
                        if (!text.includes('@tradeshare.ok') && text.length > 5) {
                            const authorEl = art.querySelector('a[href*="@"]');
                            const author = authorEl ? authorEl.textContent.trim() : 'trader';
                            return { hasUnanswered: true, author, text: art.innerText.slice(0, 120) };
                        }
                    }
                }
                return { hasUnanswered: false };
            }
        """)
        
        if unanswered_replies and unanswered_replies.get("hasUnanswered"):
            author = unanswered_replies.get("author")
            print(f"  💬 ¡Comentario de {author} encontrado en nuestro hilo! Generando respuesta...")
            reply_text = f"Totalmente de acuerdo {author}. En TradeShare (@tradeshare.ok) siempre insistimos en priorizar la gestión de riesgo antes del ratio. ¿Qué activo operas con más frecuencia?"
            
            trigger_res = page.evaluate("""
                () => {
                    const btn = document.querySelector('svg[aria-label="Responder"], div[role="button"]:has-text("Responder")');
                    if (btn) { (btn.closest('[role="button"]') || btn).click(); return true; }
                    return false;
                }
            """)
            if trigger_res:
                page.wait_for_timeout(500)
                human_type_fast(page, reply_text)
                page.keyboard.press("Control+Enter")
                page.wait_for_timeout(1000)
                print("  ✅ Respuesta de engagement enviada para viralizar el hilo propio.")
        else:
            print("  ✨ Hilo propio al día sin comentarios pendientes.")
    except Exception as e:
        print(f"  ℹ️ Nota en boost de hilo propio: {e}")

def is_within_schedule():
    """Verifica si el horario actual está dentro de las horas de trabajo configuradas en ig-config.json."""
    try:
        config_paths = [
            os.path.join(os.getcwd(), ".agent", "ig-config.json"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".agent", "ig-config.json"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".agent", "ig-config.json"),
            "/home/biurato/Documentos/tradeshare/trade-share/.agent/ig-config.json"
        ]
        config = None
        for cp in config_paths:
            if os.path.exists(cp):
                try:
                    with open(cp, "r", encoding="utf-8") as f:
                        config = json.load(f)
                    break
                except Exception:
                    pass
        if not config:
            curr_hour = datetime.now().hour
            return 8 <= curr_hour < 23
            
        schedule = config.get("workSchedule", {})
        mode = schedule.get("mode", "scheduled")
        if mode in ["24/7", "always"]:
            return True
            
        start_hour = schedule.get("startHour", 8)
        end_hour = schedule.get("endHour", 23)
        curr_hour = datetime.now().hour
        if start_hour <= end_hour:
            return start_hour <= curr_hour < end_hour
        else:
            return curr_hour >= start_hour or curr_hour < end_hour
    except Exception:
        return True

# ─── Main Run Bot Loop ──────────────────────────────────────────────────────────

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
            print("⏳ [DAEMON] Iniciando en bucle de prospección...")
            while True:
                try:
                    if not is_within_schedule():
                        print("😴 [THREADS] Fuera del horario operativo configurado. Modo reposo activo. Pausando 10 minutos...")
                        time.sleep(600)
                        continue
                    run_bot(args.tags, args.limit, dry_run=False)
                    rest_minutes = random.randint(2, 4)
                    print(f"💤 Ciclo completado. Pausa de {rest_minutes} minutos antes de la siguiente ronda...")
                    time.sleep(rest_minutes * 60)
                except Exception as e:
                    print(f"⚠️ Error en ciclo de outreach: {e}. Reintentando en 10s...")
                    time.sleep(10)
        else:
            run_bot(args.tags, args.limit, dry_run=True)

if __name__ == "__main__":
    main()
