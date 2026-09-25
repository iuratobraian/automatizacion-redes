import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname);
const homedir = os.homedir();

/**
 * Resuelve la ruta absoluta de un archivo o carpeta buscando en:
 * 1. automatizacion-redes/media/ (local del repo)
 * 2. ~/Escritorio/trade-share/automatizacion-redes/media/
 * 3. ~/Escritorio/media/
 */
function resolveProductPath(subpath) {
  const candidates = [
    path.join(ROOT, 'media', subpath),
    path.join(homedir, 'Escritorio', 'trade-share', 'automatizacion-redes', 'media', subpath),
    path.join(homedir, 'Documentos', 'tradeshare', 'trade-share', 'automatizacion-redes', 'media', subpath),
    path.join(homedir, 'Escritorio', 'media', subpath)
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(ROOT, 'media', subpath);
}

// Catálogo estructurado de productos con imágenes reales y copys de alto impacto
export const PRODUCT_CATALOG = [
  // ─── BOT GESTOR PRO (MT5) ───
  {
    id: "bot_gestor_general",
    producto: "Bot Gestor Pro MT5",
    tipo: "Software / Automatización Defensiva",
    imagen: resolveProductPath("bot gestor/bot.png"),
    titulo: "🤖 Bot Gestor MT5: La disciplina matemática que tu trading necesita",
    copy: `¿Sabías cuál es la razón #1 por la que el 90% de los traders quema sus cuentas de fondeo?
No es fallar una operación: es la falta de control emocional al gestionar el trade vivo.

El **Bot Gestor de TradeShare** automatiza toda la operativa defensiva en MetaTrader 5:
✅ Auto Break Even matemático al alcanzar tu 1:1 o zona de liquidez.
✅ Cierre parcial de lotaje configurable para asegurar ganancias en el bolsillo.
✅ Trailing Stop inteligente ceñido por estructura de velas.
✅ Bloqueo estricto por Drawdown Diario: si tocas tu límite de pérdida, apaga la terminal y bloquea el revenge trading.

Dejá de pelear contra tus emociones en caliente. Dejá que la matemática gestione por vos.
👉 Accedé al Bot Gestor en: trade-share.com`,
    tags: ["#trading", "#botgestor", "#metatrader5", "#gestionderiesgo", "#cuentasdefondeo", "#tradeshare"]
  },
  {
    id: "bot_gestor_panel",
    producto: "Bot Gestor Pro MT5",
    tipo: "Panel Operativo en Pantalla",
    imagen: resolveProductPath("bot gestor/cuadrooperativo.png"),
    titulo: "📊 Control Total en Pantalla: El Cuadro Operativo del Bot Gestor",
    copy: `Así se ve tener el control total de tu riesgo en vivo mientras operas.

Con el **Cuadro Operativo del Bot Gestor de TradeShare** en tu gráfico de MT5:
🎯 Cálculo automático de lotaje exacto según el porcentaje de riesgo deseado (0.5%, 1%, etc.).
🎯 Visualización clara de flotante, beneficio asegurado y ratio riesgo/beneficio en tiempo real.
🎯 Botones de cierre rápido por parciales (25%, 50%, 75%) o cierre total con un solo click.
🎯 Auditoría visual instantánea para que nunca sobreoperes por impulso.

Operar de forma profesional no es improvisar; es ejecutar con herramientas institucionales.
Conocé el ecosistema completo en trade-share.com`,
    tags: ["#scalping", "#nasdaq", "#xauusd", "#riskmanagement", "#forextrader", "#tradeshare"]
  },
  {
    id: "bot_gestor_menu",
    producto: "Bot Gestor Pro MT5",
    tipo: "Configuración y Parámetros",
    imagen: resolveProductPath("bot gestor/menu.png"),
    titulo: "⚙️ Personalización Total: Adaptado a tus Reglas y a tu Estrategia",
    copy: `Tu estrategia es única, y la gestión de tus órdenes debe adaptarse a vos, no al revés.

El menú del **Bot Gestor de TradeShare** te permite configurar:
🛡️ Puntos exactos para activación de Break Even y compensación de spread/comisiones.
🛡️ Trailing Stop escalonado o dinámico por máximos/mínimos anteriores.
🛡️ Máxima pérdida monetaria o porcentual diaria autorizada.
🛡️ Horarios de operación permitidos para evitar sesiones muertas o spreads altos.

Protegé tu capital y superá tus retos de fondeo con disciplina de código cerrado.
👉 Descargalo y configuralo en: trade-share.com`,
    tags: ["#propfirms", "#ftmo", "#fundednext", "#tradingdisciplina", "#psicotrading", "#tradeshare"]
  },
  {
    id: "bot_gestor_zonas",
    producto: "Bot Gestor Pro MT5",
    tipo: "Ejecución por Zonas",
    imagen: resolveProductPath("bot gestor/zonas.png"),
    titulo: "🎯 Ejecución Quirúrgica en Zonas de Liquidez",
    copy: `El mercado no se mueve al azar: va de zona de liquidez a zona de liquidez.

Mirá cómo el **Bot Gestor** gestiona posiciones directamente sobre los niveles estructurales:
📈 Cierra parciales en la llegada a máximos de sesión previa.
📉 Mueve el Stop Loss detrás de la última vela con volumen para garantizar ganancias sin que el retroceso te expulse en pérdidas.
💡 Menos tiempo frente a la pantalla con los ojos secos, mayor tranquilidad mental para tu vida.

El trading es libertad, no esclavitud frente al monitor.
👉 Unite a TradeShare hoy: trade-share.com`,
    tags: ["#priceaction", "#smartmoney", "#orderblocks", "#daytrading", "#tradeshare"]
  },

  // ─── INDICADOR INSTITUCIONAL VIP ───
  {
    id: "indicador_live",
    producto: "Indicador Institucional VIP",
    tipo: "Herramienta de Análisis Técnico",
    imagen: resolveProductPath("indicador/indicador.png"),
    titulo: "📈 Indicador de Zonas Institucionales: Claridad Total en el Gráfico",
    copy: `Basta de llenar tu pantalla con 15 indicadores retrasados que te confunden y te dan señales contradictorias.

El **Indicador de Zonas de TradeShare** limpia el ruido y resalta lo que realmente mueve el precio:
💎 Zonas de Oferta y Demanda de alta probabilidad institucional.
💎 Detección en tiempo real de barridos de liquidez (Stop Hunts) en apertura de sesiones.
💎 Mapeo de bloques de órdenes (Order Blocks) respetados por los grandes fondos.
💎 Gráfico sobrio, limpio y profesional.

Dejá de operar a ciegas. Mirá el mercado con los ojos de las instituciones financieras.
👉 Disponible en TradeShare: trade-share.com`,
    tags: ["#analisistecnico", "#indicador", "#orderblock", "#forex", "#futuros", "#tradeshare"]
  },
  {
    id: "indicador_menu",
    producto: "Indicador Institucional VIP",
    tipo: "Configuración de Algoritmo",
    imagen: resolveProductPath("indicador/menu.png"),
    titulo: "🎛️ Algoritmo Adaptable: Ajuste Fino para Scalping y Swing Trading",
    copy: `¿Operás velas de 1 minuto en el Nasdaq o prefieres swing trading en H4 para Forex?

El panel de configuración del **Indicador VIP de TradeShare** te permite:
⚡ Ajustar la sensibilidad de detección de zonas institucionales.
⚡ Filtrar estructuras multi-timeframe para operar siempre a favor de la tendencia macro.
⚡ Activar alertas sonoras y notificaciones al tocar niveles clave de alta reacción.
⚡ Personalizar la estética visual para mantener un espacio de trabajo relajado y enfocado.

Tu gráfico es tu oficina de trabajo. Mantenelo ordenado y con la mejor tecnología.
👉 Conocelo en trade-share.com`,
    tags: ["#tradingview", "#metatrader", "#scalper", "#swingtrader", "#tradeshare"]
  },
  {
    id: "indicador_zonas",
    producto: "Indicador Institucional VIP",
    tipo: "Mapeo de Liquidez",
    imagen: resolveProductPath("indicador/zonas.png"),
    titulo: "🎯 Zonas Clave Reveladas: Dónde Entran los Grandes Participantes",
    copy: `La mayoría de los traders minoristas compran en techos y venden en suelos porque persiguen velas verdes y rojas con euforia.

Con el **Indicador de Zonas de TradeShare**:
🟢 Comprás en zonas de descuento institucional con Stop Loss ultra-ajustado.
🔴 Vendés en zonas de prima donde las instituciones toman beneficios.
📊 Obtener ratios riesgo/beneficio 1:3 o 1:5 se vuelve una consecuencia natural de entrar en los puntos de inflexión exactos.

Elevá tu nivel de trading con herramientas diseñadas por traders serios.
👉 Unite gratis a la comunidad: trade-share.com`,
    tags: ["#liquidez", "#smc", "#tradinglatam", "#forexespañol", "#criptomercado", "#tradeshare"]
  }
];

const ROTATION_STATE_FILE = path.join(ROOT, '.agent', 'product_rotation_state.json');

/**
 * Obtiene el siguiente post de producto en rotación secuencial.
 */
export function getNextProductPost() {
  let currentIndex = 0;
  try {
    if (fs.existsSync(ROTATION_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(ROTATION_STATE_FILE, 'utf8'));
      if (typeof data.index === 'number') {
        currentIndex = (data.index + 1) % PRODUCT_CATALOG.length;
      }
    }
  } catch (e) {}

  try {
    fs.mkdirSync(path.dirname(ROTATION_STATE_FILE), { recursive: true });
    fs.writeFileSync(ROTATION_STATE_FILE, JSON.stringify({ index: currentIndex, lastId: PRODUCT_CATALOG[currentIndex].id, date: new Date().toISOString() }, null, 2));
  } catch (e) {}

  return PRODUCT_CATALOG[currentIndex];
}

/**
 * Obtiene un post de producto aleatorio.
 */
export function getRandomProductPost() {
  const index = Math.floor(Math.random() * PRODUCT_CATALOG.length);
  return PRODUCT_CATALOG[index];
}
