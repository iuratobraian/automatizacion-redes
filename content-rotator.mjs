import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import os from "os";

import { getNextProductPost, getRandomProductPost, PRODUCT_CATALOG } from "./product-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const homedir = os.homedir();

// ─── CARPETA UNIFICADA DE CONTENIDO ────────────────────────────────────────────
// Se usa UNA SOLA fuente de verdad. El Escritorio/media es la primaria.
// Si no existe, cae al directorio interno del proyecto.
function resolveDir(subdir) {
  const candidates = [
    path.join(homedir, "Escritorio", "media", subdir),
    path.join(__dirname, "media", subdir),
    path.join(ROOT, "media", subdir),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Crear el directorio si no existe
  const fallback = candidates[0];
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

export const FEED_DIR    = resolveDir("feed");
export const STORIES_DIR = resolveDir("historias");

// Archivo de estado de rotación — guarda hashes de archivos ya usados
const ROTATION_STATE_PATH = path.join(ROOT, ".agent", "content_rotation_state.json");

function loadRotationState() {
  try {
    if (fs.existsSync(ROTATION_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(ROTATION_STATE_PATH, "utf8"));
    }
  } catch {}
  return { feed: [], historias: [] };
}

function saveRotationState(state) {
  try {
    fs.writeFileSync(ROTATION_STATE_PATH, JSON.stringify(state, null, 2));
  } catch {}
}

// Calcula hash MD5 del contenido del archivo para detectar duplicados reales
function fileHash(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch {
    return null;
  }
}

// 50 copies y títulos rotativos de trading premium TradeShare
export const COPIES_LIBRARY = [
  {
    frase: "CONTROL DEL DRAWDOWN GRATIS",
    copy: "El profesional controla el drawdown. En TradeShare auditas tus números GRATIS con la Bitácora Pro. Dominá tu trading de forma matemática en trade-share.com. ¡Vamos a competir!"
  },
  {
    frase: "PACIENCIA DE HIERRO Y TODO GRATIS",
    copy: "La paciencia paga. Usá el diario automático de TradeShare GRATIS, eliminá el sobretrading y creá una ventaja real. Registrate en trade-share.com sin pagar nada."
  },
  {
    frase: "VENTAJA ESTADÍSTICA SIN COSTO",
    copy: "El trading serio se basa en números. Vinculá tu cuenta en TradeShare GRATIS, descubrí tu win-rate y usá la Bitácora Pro sin cargo en trade-share.com"
  },
  {
    frase: "GESTIÓN DEL RIESGO PRO GRATIS",
    copy: "Blindá tu capital con análisis inteligente. TradeShare es ahora 100% GRATIS: Bitácora Pro y comunidades profesionales en trade-share.com"
  },
  {
    frase: "PSICOLOGÍA DEL MERCADO Y COMUNIDAD",
    copy: "Domá tu ego con métricas automáticas. En TradeShare crear tu comunidad y usar la Bitácora Pro es GRATIS. Unite hoy en trade-share.com y vamos a ganar."
  },
  {
    frase: "BITÁCORA PRO: TU DIARIO DE TRADING",
    copy: "Registrá cada operación, analizá tus errores y mejorá semana a semana. La Bitácora Pro de TradeShare es 100% gratuita. Entrá en trade-share.com y empezá hoy."
  },
  {
    frase: "LA COMUNIDAD QUE TE POTENCIA",
    copy: "Rodeate de traders serios. En TradeShare encontrás comunidades por activo, mentorías y herramientas profesionales, todo GRATIS. Registrate en trade-share.com"
  },
  {
    frase: "TRADING CON INTELIGENCIA ARTIFICIAL",
    copy: "TradeShare integra IA para analizar tu rendimiento y sugerirte mejoras en tiempo real. Totalmente GRATUITO. Probalo en trade-share.com"
  },
  {
    frase: "COPY TRADING TRANSPARENTE",
    copy: "Seguí a los mejores traders y aprendé de sus estrategias. En TradeShare el copy trading es 100% transparente y GRATIS. Unite en trade-share.com"
  },
  {
    frase: "ANALÍTICA AVANZADA SIN PAGAR",
    copy: "Win-rate, ratio riesgo/beneficio, drawdown máximo y más métricas profesionales, todas GRATIS en TradeShare. Registrate en trade-share.com"
  }
];

export const CTAS = [
  "Unite GRATIS a trade-share.com",
  "Registrate sin costo en trade-share.com",
  "Sumate a la red social pro GRATUITA trade-share.com",
  "Probalo gratis en trade-share.com",
  "Empezá hoy en trade-share.com — es 100% gratis",
];

/**
 * Selecciona un post de producto (Bot Gestor o Indicador) con imagen real y copy educativo/comercial.
 */
export function selectProductContent() {
  const item = getNextProductPost();
  if (item && fs.existsSync(item.imagen)) {
    return {
      frase: item.titulo,
      copy: `${item.titulo}\n\n${item.copy}`,
      imagePath: item.imagen,
      isProduct: true,
      productId: item.id
    };
  }
  return null;
}

/**
 * Selecciona una imagen sin repetir usando tracking por hash MD5.
 * Garantiza variedad real aunque los archivos tengan diferentes nombres.
 * Rota periódicamente imágenes de producto reales (Bot Gestor e Indicador).
 * @param {string} type - "feed" | "story"
 * @param {boolean} allowProduct - Si permite rotar productos en feed (default true)
 * @returns {{ frase, copy, imagePath, isProduct? } | null}
 */
export function selectRotativeContent(type = "feed", allowProduct = true) {
  // Con un 30% de probabilidad en feed, priorizar una publicación de producto real (Bot Gestor o Indicador)
  if (type === "feed" && allowProduct && Math.random() < 0.30) {
    const prod = selectProductContent();
    if (prod) return prod;
  }

  const dir = type === "feed" ? FEED_DIR : STORIES_DIR;
  const stateKey = type === "feed" ? "feed" : "historias";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    // Si no hay carpeta feed, intentar producto
    if (type === "feed") return selectProductContent();
    return null;
  }

  const allFiles = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
  if (allFiles.length === 0) {
    if (type === "feed") return selectProductContent();
    return null;
  }

  // Cargar estado de rotación (qué hashes ya se usaron recientemente)
  const state = loadRotationState();
  const usedHashes = new Set(state[stateKey] || []);

  // Calcular hashes de todos los archivos disponibles
  const fileData = allFiles.map(f => {
    const absPath = path.join(dir, f);
    const hash = fileHash(absPath);
    return { filename: f, absPath, hash };
  }).filter(d => d.hash !== null);

  // Filtrar los que ya fueron usados recientemente
  let available = fileData.filter(d => !usedHashes.has(d.hash));

  // Si todos fueron usados, reiniciar el ciclo
  if (available.length === 0) {
    state[stateKey] = [];
    available = fileData;
  }

  // Elegir aleatoriamente entre los disponibles
  const chosen = available[Math.floor(Math.random() * available.length)];

  // Registrar el hash como usado
  state[stateKey] = [...(state[stateKey] || []), chosen.hash];
  // Mantener un máximo de N elementos en el historial (para evitar que el historial crezca infinito)
  const maxHistory = Math.min(Math.floor(fileData.length * 0.8), 100);
  if (state[stateKey].length > maxHistory) {
    state[stateKey] = state[stateKey].slice(-maxHistory);
  }
  saveRotationState(state);

  // Seleccionar copy y CTA rotativo
  const template = COPIES_LIBRARY[Math.floor(Math.random() * COPIES_LIBRARY.length)];
  const cta = CTAS[Math.floor(Math.random() * CTAS.length)];

  return {
    frase: template.frase,
    copy: `${template.copy}\n\n👉 ${cta}`,
    imagePath: chosen.absPath
  };
}
