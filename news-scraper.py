#!/usr/bin/env python3
"""
TradeShare News Scraper — Powered by Playwright
================================================
Extrae noticias financieras reales de múltiples fuentes y las publica
en el portal de noticias de TradeShare via API de Convex.

Fuentes soportadas:
  - Reuters (finance)
  - FXStreet (forex)
  - CoinTelegraph (crypto)
  - DailyFX (forex)

Uso:
  python3 news-scraper.py                    # Scrape todas las fuentes
  python3 news-scraper.py --source fxstreet  # Solo una fuente
  python3 news-scraper.py --dry-run          # Preview sin publicar
"""

import sys
import json
import hashlib
import re
import argparse
from datetime import datetime, timezone
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Error: Playwright no está instalado. Ejecuta: pip3 install playwright")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
CACHE_FILE = SCRIPT_DIR / ".news-cache.json"
LOG_FILE = SCRIPT_DIR / "news-scraper.log"

CONVEX_SITE_URL = "https://diligent-wildcat-523.convex.site"

SOURCES = {
    "fxstreet": {
        "name": "FXStreet",
        "url": "https://www.fxstreet.com/news",
        "category": "forex",
        "selectors": {
            "articles": "article.fxs_article",
            "title": "h2.fxs_headline_medium, h3, a",
            "summary": "p, .fxs_entry-content",
            "link": "a",
        }
    },
    "dailyfx": {
        "name": "DailyFX",
        "url": "https://www.dailyfx.com/news",
        "category": "forex",
        "selectors": {
            "articles": "article, .dfx-articleCard",
            "title": "h2, h3, a",
            "summary": "p",
            "link": "a",
        }
    },
    "cointelegraph": {
        "name": "CoinTelegraph",
        "url": "https://cointelegraph.com",
        "category": "crypto",
        "selectors": {
            "articles": "article, .post-card",
            "title": "h2, h3, span",
            "summary": "p",
            "link": "a",
        }
    }
}

CATEGORY_KEYWORDS = {
    "crypto": ["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "defi", "altcoin"],
    "forex": ["eur/usd", "gbp/usd", "forex", "fed", "ecb", "boe", "dollar", "euro", "pound", "yen"],
    "commodities": ["gold", "oil", "silver", "crude", "natural gas", "oro", "petróleo"],
    "indices": ["s&p 500", "nasdaq", "dow jones", "dax", "ftse", "nikkei", "sp500"],
}

SENTIMENT_KEYWORDS = {
    "bullish": ["rally", "surge", "rise", "gain", "bull", "soar", "jump", "growth", "positive", "optimism"],
    "bearish": ["drop", "fall", "decline", "bear", "crash", "plunge", "negative", "fear", "recession"],
}

# ─── Utilities ────────────────────────────────────────────────────────────────

def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text())
        except Exception:
            pass
    return {"seen_hashes": [], "last_run": None}

def save_cache(cache: dict):
    CACHE_FILE.write_text(json.dumps(cache, indent=2, default=str))

def article_hash(title: str) -> str:
    return hashlib.sha256(title.lower().strip().encode()).hexdigest()[:16]

def detect_category(text: str) -> str:
    text_lower = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            return category
    return "general"

def detect_sentiment(text: str) -> str:
    text_lower = text.lower()
    bull_score = sum(1 for kw in SENTIMENT_KEYWORDS["bullish"] if kw in text_lower)
    bear_score = sum(1 for kw in SENTIMENT_KEYWORDS["bearish"] if kw in text_lower)
    if bull_score > bear_score:
        return "bullish"
    elif bear_score > bull_score:
        return "bearish"
    return "neutral"

def extract_pairs(text: str) -> list:
    return list(set(re.findall(r'\b[A-Z]{3}/[A-Z]{3}\b|XAU/USD|BTC/USD', text.upper())))

def clean_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r'\s+', ' ', text).strip()[:1000]

def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

# ─── Playwright Scraping ──────────────────────────────────────────────────────

def scrape_source_with_playwright(page, source_key: str, source_config: dict, cache: dict) -> list:
    articles = []
    url = source_config["url"]
    
    log(f"🔍 [Playwright] Scraping {source_config['name']} ({url})")
    
    try:
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        
        selectors = source_config["selectors"]
        article_elements = page.query_selector_all(selectors["articles"])
        
        log(f"  ✓ Encontrados {len(article_elements)} contenedores con selector '{selectors['articles']}'")
        
        for element in article_elements[:15]:
            try:
                # Title
                title_el = element.query_selector(selectors["title"])
                if not title_el:
                    continue
                title = clean_text(title_el.text_content())
                if not title or len(title) < 15:
                    continue
                
                # Check cache
                h = article_hash(title)
                if h in cache["seen_hashes"]:
                    continue
                
                # Summary
                summary = ""
                summary_el = element.query_selector(selectors["summary"])
                if summary_el:
                    summary = clean_text(summary_el.text_content())
                
                # Link
                link = ""
                link_el = element.query_selector(selectors["link"])
                if link_el:
                    href = link_el.get_attribute("href")
                    if href:
                        if href.startswith("http"):
                            link = href
                        elif href.startswith("/"):
                            base = "/".join(url.split("/")[:3])
                            link = base + href
                
                # Image
                image_url = ""
                img_el = element.query_selector("img")
                if img_el:
                    image_url = img_el.get_attribute("src") or img_el.get_attribute("data-src") or ""
                    if image_url and not image_url.startswith("http"):
                        image_url = ""
                
                full_text = f"{title} {summary}"
                category = detect_category(full_text) if source_config["category"] == "general" else source_config["category"]
                sentiment = detect_sentiment(full_text)
                pairs = extract_pairs(full_text)
                
                article = {
                    "title": title,
                    "summary": summary or title,
                    "content": summary,
                    "source": source_key,
                    "sourceName": source_config["name"],
                    "sourceUrl": link or url,
                    "category": category,
                    "sentiment": sentiment,
                    "relatedPairs": pairs[:5],
                    "imageUrl": image_url or "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&q=80",
                    "publishedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
                    "isAIGenerated": False,
                    "views": 0,
                    "likes": [],
                    "tags": [category, source_key] + pairs[:3],
                    "_hash": h,
                }
                
                articles.append(article)
                log(f"  📰 [{category}][{sentiment}] {title[:60]}...")
                
            except Exception as e:
                continue
                
    except Exception as e:
        log(f"  ❌ Error en Playwright para {source_config['name']}: {e}")
        
    return articles

# ─── Convex Publishing ────────────────────────────────────────────────────────

def publish_to_convex(articles: list, dry_run: bool = False) -> int:
    if not articles:
        return 0
    if dry_run:
        log(f"\n🔍 DRY RUN — {len(articles)} artículos listos para publicar:")
        for a in articles:
            print(f"  [{a['category']}] {a['title'][:70]}...")
        return len(articles)
        
    import urllib.request
    published = 0
    for article in articles:
        try:
            payload = json.dumps(article).encode("utf-8")
            req = urllib.request.Request(
                f"{CONVEX_SITE_URL}/publish-news",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
                if result.get("success"):
                    published += 1
                    log(f"  ✓ Publicado: {article['title'][:60]}")
        except Exception as e:
            log(f"  ❌ Error HTTP: {e}")
    return published

def save_to_json(articles: list):
    output_file = SCRIPT_DIR / "scraped-news.json"
    existing = []
    if output_file.exists():
        try:
            existing = json.loads(output_file.read_text())
        except Exception:
            pass
    combined = articles + existing
    combined = sorted(combined, key=lambda x: x.get("publishedAt", 0), reverse=True)[:200]
    output_file.write_text(json.dumps(combined, indent=2, ensure_ascii=False))
    log(f"💾 Guardados {len(articles)} artículos en {output_file}")

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="TradeShare News Scraper (Playwright)")
    parser.add_argument("--source", help="Fuente específica a scrapear", choices=list(SOURCES.keys()))
    parser.add_argument("--dry-run", action="store_true", help="Preview sin publicar")
    parser.add_argument("--publish", action="store_true", help="Publicar en Convex")
    args = parser.parse_args()
    
    log("=" * 60)
    log(f"🚀 [Playwright] TradeShare News Scraper v2.0")
    log("=" * 60)
    
    cache = load_cache()
    sources_to_scrape = {args.source: SOURCES[args.source]} if args.source else SOURCES
    
    all_articles = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        for source_key, source_config in sources_to_scrape.items():
            articles = scrape_source_with_playwright(page, source_key, source_config, cache)
            all_articles.extend(articles)
            
        browser.close()
        
    log(f"\n📊 Total artículos scrapeados: {len(all_articles)}")
    
    if all_articles:
        save_to_json(all_articles)
        if args.publish or args.dry_run:
            published = publish_to_convex(all_articles, dry_run=args.dry_run)
            log(f"📤 Publicados en Convex: {published}")
            
        # Update cache
        new_hashes = [a["_hash"] for a in all_articles if "_hash" in a]
        cache["seen_hashes"] = list(set(cache["seen_hashes"] + new_hashes))[-500:]
        cache["last_run"] = datetime.now().isoformat()
        save_cache(cache)
        
    log("✅ Scraping completado.")

if __name__ == "__main__":
    main()
