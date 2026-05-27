/**
 * prompt-engine.mjs — Trading Prompt Generator
 * Genera prompts optimizados para la creación de imágenes asociadas a trading.
 */

// Categorías y templates de prompts visuales
export const PROMPT_TEMPLATES = {
  psicologia: [
    "Professional trading chart analysis scene, {emotion} trader at desk, {style} art style, dark dramatic lighting, financial screens glowing, high detail, premium aesthetic",
    "Abstract visualization of {concept} in trading, minimalist design, dark background with {color} accents, professional financial aesthetic, high definition"
  ],
  fomo: [
    "Dynamic stock market scene showing massive price surge, green candles breaking resistance, urgency atmosphere, professional trading terminal, {style}",
    "Split screen showing missed opportunity vs. successful trade, photorealistic, dark theme with {color} highlights, {emotion} atmosphere"
  ],
  smart_money: [
    "Institutional trader workspace, multiple screens, professional environment, dark sophisticated aesthetic, Bloomberg terminal style, {style}",
    "Whale movement visualization in crypto market, deep ocean metaphor meets financial charts, dramatic lighting, premium {color} accents"
  ],
  cta_comunidad: [
    "Exclusive trading community visual, golden door opening to charts and profits, premium dark aesthetic, TradeShare branding space, photorealistic",
    "Group of successful traders celebrating, modern financial office, achievement atmosphere, motivational, {style}"
  ],
  scalping: [
    "Ultra-fast trading action, multiple monitors with 1-minute charts, focused trader, cinematic style, neon {color} accents on dark background",
    "Precision sniper metaphor with trading chart, exact entry point highlighted, professional dark background, {style}"
  ],
  riesgo_gestion: [
    "Risk management visualization, shield protecting portfolio from stock market crash, professional financial graphic, dark blue and gold palette",
    "Balance scale with risk vs reward, trading symbols, professional minimalist design, dark background, premium {color} details"
  ],
  resultados: [
    "Successful trading results dashboard, green profit numbers, clean UI design, celebration atmosphere, professional, {style}",
    "Trader journey transformation visual, before/after concept, motivational, dark premium aesthetic, high resolution"
  ]
};

// Valores por defecto para rellenar los placeholders
const DEFAULT_PLACEHOLDERS = {
  emotion: ["calm", "disciplined", "resilient", "focused", "patient", "determined"],
  style: ["cinematic", "photorealistic", "ultra-detailed", "sleek modern", "dramatic studio lighting"],
  concept: ["risk-to-reward ratio", "drawdown resilience", "emotional control", "market volume", "institutional liquidity"],
  color: ["emerald green", "neon purple", "gold", "electric blue", "cyberpunk violet"]
};

/**
 * Retorna un valor aleatorio de una lista
 */
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Genera un prompt de trading personalizado basado en una categoría y opciones
 */
export function generateTradingPrompt(category, options = {}) {
  const templates = PROMPT_TEMPLATES[category] || PROMPT_TEMPLATES.psicologia;
  let template = getRandomItem(templates);

  // Rellenar placeholders
  const emotion = options.emotion || getRandomItem(DEFAULT_PLACEHOLDERS.emotion);
  const style = options.style || getRandomItem(DEFAULT_PLACEHOLDERS.style);
  const concept = options.concept || getRandomItem(DEFAULT_PLACEHOLDERS.concept);
  const color = options.color || getRandomItem(DEFAULT_PLACEHOLDERS.color);

  let prompt = template
    .replace(/{emotion}/g, emotion)
    .replace(/{style}/g, style)
    .replace(/{concept}/g, concept)
    .replace(/{color}/g, color);

  // Asegurar firma sutil de TradeShare
  if (!prompt.toLowerCase().includes('tradeshare')) {
    prompt += ", featuring trade-share.com branding sutilly, dark theme";
  }

  return prompt;
}

/**
 * Genera un lote de prompts balanceados y variados (15 por defecto)
 */
export function generateBatchPrompts(count = 15) {
  const categories = Object.keys(PROMPT_TEMPLATES);
  const batch = [];

  for (let i = 0; i < count; i++) {
    // Rotar de forma balanceada entre las categorías disponibles
    const category = categories[i % categories.length];
    const promptText = generateTradingPrompt(category);
    
    // Sugerencias básicas de títulos y captions asociadas al tema
    let suggestedTitle = "";
    let suggestedCaption = "";

    switch (category) {
      case 'psicologia':
        suggestedTitle = "⚡ La clave aburrida de la consistencia";
        suggestedCaption = "El 90% del éxito en el trading ocurre fuera de las pantallas. La paciencia de no forzar operaciones es tu mejor aliada. 🧠 #trading #psicologia";
        break;
      case 'fomo':
        suggestedTitle = "🔴 ¿Sufres de FOMO?";
        suggestedCaption = "Ver subir una vela verde y saltar sin confirmaciones es la receta perfecta para el desastre. Respeta tu plan. 📉 #psicotrading #fomo";
        break;
      case 'smart_money':
        suggestedTitle = "🐋 Sigue la huella institucional";
        suggestedCaption = "El mercado no se mueve al azar. Las instituciones inyectan liquidez en zonas específicas. Aprende a operar Smart Money con nosotros. 📊 #smc #orderflow";
        break;
      case 'cta_comunidad':
        suggestedTitle = "🚀 Un espacio para traders reales";
        suggestedCaption = "Deja las hojas de Excel y los chats caóticos. En TradeShare bitacoreas y te conectas con profesionales en una sola suite. 🌐 #tradeshare #comunidad";
        break;
      case 'scalping':
        suggestedTitle = "⚡ Precisión de minutos";
        suggestedCaption = "Scalping no es presionar botones rápido. Es operar con exactitud milimétrica en killzones de liquidez. ⏱️ #scalping #forex";
        break;
      case 'riesgo_gestion':
        suggestedTitle = "🛡️ Tu única protección real";
        suggestedCaption = "La gestión de riesgo no te hace ganar dinero hoy, te mantiene vivo para mañana. Ratio mínimo 1:2 innegociable. 💰 #riesgo #gestionderiesgo";
        break;
      case 'resultados':
        suggestedTitle = "📈 El diario de la verdad";
        suggestedCaption = "No puedes mejorar lo que no mides. Nuestra bitácora automatizada te muestra el diagnóstico exacto de tu operativa. 📊 #consistencia #tradeshare";
        break;
    }

    batch.push({
      prompt: promptText,
      category,
      suggestedTitle,
      suggestedCaption
    });
  }

  return batch;
}
