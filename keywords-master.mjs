/**
 * ═══════════════════════════════════════════════════════════════════
 * KEYWORDS MASTER — FUENTE ÚNICA DE VERDAD
 * ═══════════════════════════════════════════════════════════════════
 *
 * REGLA DE ORO: Si una palabra aparece en un caption, descripción,
 * CTA o prompt de un post, DEBE estar aquí para ser detectada en
 * comentarios. Si no está aquí, el sistema no la escuchará.
 *
 * CÓMO AGREGAR KEYWORDS:
 *  1. Identificar en qué categoría va (HIGH / MEDIUM / LOW)
 *  2. Agregar la variante exacta que usás en el post Y sus variantes
 *     comunes (mayúsculas, con/sin tilde, abreviaciones).
 *  3. Documentar el CTA del post que la dispara en el comentario.
 *
 * ESTRUCTURA:
 *  - HIGH   → CTAs directos del post ("escribí INFO", "comentá ACCESO")
 *  - MEDIUM → Términos de interés real sobre el producto/servicio
 *  - LOW    → Señales de engagement que pueden convertirse en leads
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// TIER 1 — HIGH PRIORITY
// Palabras exactas que los posts invitan a escribir en comentarios.
// Si tu caption dice "Escribí X", X debe estar en este array.
// ─────────────────────────────────────────────────────────────────
export const HIGH_PRIORITY_KEYWORDS = [
  // ── CTAs directos usados en content_categories de ig-config ──
  "INFO",          // usado en: ganchos_calientes, fallback copy
  "info",
  "ACCESO",        // usado en: frases_motivacion
  "acceso",
  "GUIA",          // usado en: educacion
  "guia",
  "guía",
  "RESULTADOS",    // usado en: social_proof
  "resultados",
  "SISTEMA",       // usado en: posts de automatización
  "sistema",

  // ── Frases de solicitud directa de información ──
  "más info",
  "mas info",
  "más información",
  "mas información",
  "mas informacion",
  "más informacion",
  "quiero info",
  "quiero acceso",
  "quiero el link",
  "info precio",
  "el link",
  "link",
  "pasame el link",
  "manda el link",
  "precio",
  "cuánto cuesta",
  "cuanto cuesta",
  "cómo accedo",
  "como accedo",
];

// ─────────────────────────────────────────────────────────────────
// TIER 2 — MEDIUM PRIORITY
// Términos relacionados al producto que indican interés real.
// Si el post habla de un tema, sus palabras clave van acá.
// ─────────────────────────────────────────────────────────────────
export const MEDIUM_PRIORITY_KEYWORDS = [
  // ── Trading y mercados (usados en prompts de imagen y captions) ──
  "trading",
  "trader",
  "traders",
  "forex",
  "cripto",
  "criptos",
  "bitcoin",
  "btc",
  "invertir",
  "inversión",
  "inversion",
  "ganancias",
  "señales",
  "senales",
  "estrategia",

  // ── Features de TradeShare (usados en captions) ──
  "bitácora",
  "bitacora",
  "psicotrading",
  "psicología",
  "psicologia",
  "bot",
  "automatizar",
  "automatizo",
  "MT5",
  "mt5",
  "consistencia",
  "disciplina",
  "drawdown",
  "backtesting",
  "riesgo",
  "gestión",
  "gestion",
  "killzone",
  "fondeo",
  "winrate",

  // ── IA ──
  "ia",
  "IA",
  "inteligencia artificial",

  // ── Frases de consulta e interés ──
  "información",
  "informacion",
  "cómo funciona",
  "como funciona",
  "interesado",
  "interesada",
  "me interesa",
  "quiero saber",
  "donde puedo",
  "dónde puedo",
  "aprender",
  "aprendo",
  "aprende",
  "enseñame",
  "ensenme",
  "quiero aprender",
  "quiero empezar",
  "empezar",
  "empiezo",
  "inicio",
];

// ─────────────────────────────────────────────────────────────────
// TIER 3 — LOW PRIORITY
// Señales de engagement que pueden convertirse en leads.
// No son CTAs pero muestran interés genuino.
// ─────────────────────────────────────────────────────────────────
export const LOW_PRIORITY_KEYWORDS = [
  "wow",
  "genial",
  "increíble",
  "increible",
  "buenísimo",
  "buenisimo",
  "excelente",
  "qué es esto",
  "que es esto",
  "de qué se trata",
  "de que se trata",
  "interés",
  "interes",
  "interest",
  "bueno",
  "me llama la atención",
  "me llama la atencion",
  "parece bueno",
  "gracias",
  "hola",
  "Hola",
  "interesa",
  "detalles",
  "necesito",
  "quiero",
  "consulta",
  "pregunta",
];

// ─────────────────────────────────────────────────────────────────
// LISTA PLANA COMPLETA — Para daemons que usan un array único
// ─────────────────────────────────────────────────────────────────
export const ALL_KEYWORDS = [
  ...HIGH_PRIORITY_KEYWORDS,
  ...MEDIUM_PRIORITY_KEYWORDS,
  ...LOW_PRIORITY_KEYWORDS,
];

// ─────────────────────────────────────────────────────────────────
// MAPA DE KEYWORDS A CTAs — Para saber con qué responder
// ─────────────────────────────────────────────────────────────────
export const KEYWORD_TO_CTA = {
  // CTA directo a acceso
  "INFO":        "high",
  "info":        "high",
  "ACCESO":      "high",
  "acceso":      "high",
  "GUIA":        "high",
  "guia":        "high",
  "guía":        "high",
  "RESULTADOS":  "high",
  "resultados":  "high",
  "SISTEMA":     "high",
  "sistema":     "high",
  "más info":    "high",
  "mas info":    "high",
  "precio":      "high",
  "link":        "high",

  // Interés en producto
  "trading":     "medium",
  "bitácora":    "medium",
  "bitacora":    "medium",
  "consistencia":"medium",
  "disciplina":  "medium",
  "ia":          "medium",
  "IA":          "medium",
  "interesado":  "medium",
  "interesada":  "medium",

  // Engagement
  "gracias":     "low",
  "excelente":   "low",
  "hola":        "low",
  "genial":      "low",
};

// ─────────────────────────────────────────────────────────────────
// PATRONES A IGNORAR — Spam y bots
// ─────────────────────────────────────────────────────────────────
export const IGNORE_PATTERNS = [
  "spam",
  "follow back",
  "sígueme",
  "sigueme",
  "check my profile",
  "giveaway",
  "sorteo",
  "bot fake",
  "scam",
  "sigue mi perfil",
];

/**
 * Detecta si un texto contiene alguna keyword y devuelve
 * la keyword encontrada junto con su prioridad.
 *
 * @param {string} text - Texto del comentario
 * @returns {{ keyword: string, priority: 'high'|'medium'|'low' } | null}
 */
export function detectKeyword(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Verificar primero que no sea spam
  for (const pattern of IGNORE_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return null;
  }

  // Buscar primero en HIGH (mayor prioridad)
  for (const kw of HIGH_PRIORITY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return { keyword: kw, priority: 'high' };
    }
  }

  // Luego MEDIUM
  for (const kw of MEDIUM_PRIORITY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return { keyword: kw, priority: 'medium' };
    }
  }

  // Finalmente LOW
  for (const kw of LOW_PRIORITY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return { keyword: kw, priority: 'low' };
    }
  }

  return null;
}

/**
 * Imprime un resumen de todas las keywords activas — útil para debug.
 */
export function printKeywordSummary() {
  console.log('════════════════════════════════════════════════════');
  console.log('🔑 KEYWORDS MAESTRAS ACTIVAS');
  console.log('════════════════════════════════════════════════════');
  console.log(`🔴 HIGH  (${HIGH_PRIORITY_KEYWORDS.length}):  ${HIGH_PRIORITY_KEYWORDS.join(', ')}`);
  console.log(`🟡 MEDIUM (${MEDIUM_PRIORITY_KEYWORDS.length}): ${MEDIUM_PRIORITY_KEYWORDS.join(', ')}`);
  console.log(`🟢 LOW  (${LOW_PRIORITY_KEYWORDS.length}):   ${LOW_PRIORITY_KEYWORDS.join(', ')}`);
  console.log(`📦 TOTAL: ${ALL_KEYWORDS.length} keywords monitoreadas`);
  console.log('════════════════════════════════════════════════════');
}
