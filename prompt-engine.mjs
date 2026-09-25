/**
 * prompt-engine.mjs — Trading Prompt Generator
 * Genera prompts optimizados para la creación de imágenes asociadas a trading.
 */

// Categorías y templates de prompts visuales realistas y fotográficos
export const PROMPT_TEMPLATES = {
  psicologia: [
    "Candid 35mm film photography of a {emotion} trader seated at an organized wooden desk, reviewing a clean TradingView candlestick chart on a modern MacBook, soft morning window light, warm ceramic coffee mug, natural depth of field, authentic realistic lifestyle",
    "Minimalist photograph of a quiet modern workspace, notebook with handwritten trading risk rules next to a sleek laptop showing financial charts, warm desk lamp, {style}, authentic documentary photography"
  ],
  fomo: [
    "Realistic candid photo of a disciplined trader with hands off the keyboard, calmly watching market consolidation on screen, natural office atmosphere, {style}, clean aesthetic",
    "Close-up photograph of hands writing in a physical leather trading journal next to an espresso cup, laptop screen slightly blurred in background with clean candlestick price action, warm natural light"
  ],
  smart_money: [
    "Authentic photograph of a clean professional trading workstation, ultra-wide monitor with uncluttered price action charts and volume profiles, minimalist architecture, daylight streaming through large windows, {style}",
    "Top-down flatlay photograph of a trader's desk: MacBook displaying market structure, fountain pen, open trading plan, matte ceramic mug, neutral warm tones, Leica aesthetic"
  ],
  cta_comunidad: [
    "Two professional traders (man and woman) collaborating in a bright modern coworking space, looking at a tablet displaying market charts, smiling naturally, coffee cups on wooden table, real human interaction",
    "A trader analyzing market setups from a bright, aesthetic cafe balcony in the morning, laptop open with clean chart, natural city background, authentic documentary style"
  ],
  scalping: [
    "Focused trader in a tidy home office during the New York market open, dual clean screens with technical analysis, soft natural lighting, calm and calculated composure, {style}",
    "Close-up perspective shot of a modern keyboard and mouse on a sleek desk mat, computer screen with sharp candlestick chart, natural indoor lighting, professional photography"
  ],
  riesgo_gestion: [
    "Minimalist still life photograph: elegant fountain pen resting on a printed trading risk management sheet with 1:2 risk-reward ratios, laptop in soft focus background, natural daylight",
    "Clean desk setup with financial ledger, mechanical keyboard, and a single cup of black coffee, morning sunlight creating subtle shadows, authentic film grain"
  ],
  resultados: [
    "Real trader smiling with relief and closing their laptop after a disciplined morning session, comfortable home studio with bookshelf, warm natural daylight, peaceful atmosphere",
    "Aesthetic trading study at golden hour, laptop screen reflecting warm sunset tones, clean desk, small succulent plant, realistic and serene lifestyle photography"
  ]
};

// Valores por defecto para rellenar los placeholders
const DEFAULT_PLACEHOLDERS = {
  emotion: ["calm", "disciplined", "resilient", "focused", "patient", "composed"],
  style: ["35mm film style with soft grain", "Fujifilm natural film simulation", "Leica M11 candid documentary aesthetic", "clean editorial photography", "soft diffused natural daylight"],
  concept: ["risk-to-reward ratio", "drawdown discipline", "emotional control", "market volume", "institutional liquidity"],
  color: ["warm amber", "subtle forest green", "muted slate", "natural oak", "neutral charcoal"]
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
