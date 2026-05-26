import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RECENT_JSON = path.join(ROOT, ".agent", "recent_images.json");

// Directorios absolutos de imágenes
const FEED_DIR = "/home/biurato/Escritorio/trade-share/GENERADASIA/FEED/";
const STORIES_DIR = "/home/biurato/Escritorio/trade-share/GENERADASIA/HISTORIAS/";

// 50 copies y títulos rotativos de trading premium TradeShare
const COPIES_LIBRARY = [
  {
    frase: "CONTROL DEL DRAWDOWN",
    copy: "El amateur busca la entrada perfecta; el profesional controla el drawdown. No dejes que una mala racha destruya semanas de consistencia. Con la bitácora IA de TradeShare, auditas tus números gratis en tiempo real y dominas tu drawdown de forma matemática. Registrate hoy."
  },
  {
    frase: "PACIENCIA DE HIERRO",
    copy: "Esperar a que se alinee tu setup es el verdadero trabajo del trader. La paciencia paga más que cualquier indicador mágico. Llevá tu diario automático en TradeShare, eliminá el sobretrading y creá una ventaja estadística robusta. Acceso gratuito en nuestra web."
  },
  {
    frase: "LA VENTAJA ESTADÍSTICA",
    copy: "Si no auditas tus trades, estás jugando a la ruleta. El trading institucional se basa en números reales, no en corazonadas. Vinculá tu cuenta de Exness en TradeShare gratis, descubrí tu win-rate exacto por sesión y operá como una verdadera prop firm."
  },
  {
    frase: "GESTIÓN DEL RIESGO",
    copy: "Arriesgar más del 1% por operación es la receta perfecta para quebrar tu cuenta. El secreto de la rentabilidad es la asimetría de riesgo/beneficio. Automatizá tu registro de operaciones con TradeShare y blindá tu capital con análisis inteligente."
  },
  {
    frase: "PSICOLOGÍA DEL MERCADO",
    copy: "El mercado no te conoce ni le importa tu saldo. Tu peor enemigo no es el broker, es tu propio ego. En TradeShare ayudamos a traders consistentes a domar el factor emocional mediante métricas automatizadas de comportamiento. Unite gratis hoy."
  }
];

const CTAS = [
  "Comenta SISTEMA y te mandamos una invitación exclusiva.",
  "Comenta IA para recibir acceso directo y auditar tu cuenta gratis.",
  "Comenta INFO y sumate a la red social premium de trading profesional.",
  "Comenta HERRAMIENTA y te enviamos el link de registro directo al DM."
];

// Obtener imagen aleatoria sin repeticiones recientes
export function selectRotativeContent(type = "feed") {
  const dir = type === "feed" ? FEED_DIR : STORIES_DIR;
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return null;
  }

  const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
  if (files.length === 0) return null;

  // Cargar recientes
  let recent = [];
  if (fs.existsSync(RECENT_JSON)) {
    try {
      recent = JSON.parse(fs.readFileSync(RECENT_JSON, "utf8"));
    } catch {}
  }

  // Filtrar no usadas recientemente
  let available = files.filter(f => !recent.includes(f));
  if (available.length === 0) {
    available = files; // Reset si todas fueron usadas
    recent = [];
  }

  // Elegir una
  const chosenFile = available[Math.floor(Math.random() * available.length)];
  
  // Guardar en recientes
  recent.push(chosenFile);
  if (recent.length > 50) recent.shift(); // Límite de memoria
  fs.writeFileSync(RECENT_JSON, JSON.stringify(recent, null, 2));

  const absolutePath = path.join(dir, chosenFile);

  // Seleccionar copy y CTA rotativo
  const template = COPIES_LIBRARY[Math.floor(Math.random() * COPIES_LIBRARY.length)];
  const cta = CTAS[Math.floor(Math.random() * CTAS.length)];

  return {
    frase: template.frase,
    copy: `${template.copy}\n\n👉 ${cta}`,
    imagePath: absolutePath
  };
}
