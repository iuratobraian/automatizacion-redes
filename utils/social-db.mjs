import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROJECT_ROOT = process.cwd();
const DB_FILE = path.join(PROJECT_ROOT, '.agent', 'social_db.json');
const CONFIG_FILE = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');

// --- Carga Inicial Síncrona / Asíncrona de BD ---
let db = {
  posts_created: [],
  comments_made: []
};

async function initDB() {
  try {
    const dir = path.dirname(DB_FILE);
    await fs.mkdir(dir, { recursive: true });
    
    const exists = fsSync.existsSync(DB_FILE);
    if (exists) {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      db = JSON.parse(data);
      if (!db.posts_created) db.posts_created = [];
      if (!db.comments_made) db.comments_made = [];
    } else {
      await saveDB();
    }
  } catch (e) {
    console.error('[SOCIAL-DB] Error inicializando BD:', e.message);
  }
}

async function saveDB() {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('[SOCIAL-DB] Error guardando BD:', e.message);
  }
}

// --- Normalización de URLs para evitar falsos negativos ---
function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    let urlString = rawUrl.trim();
    // Remover "/" al final
    urlString = urlString.replace(/\/+$/, '');
    
    // Parsear URL para remover query parameters
    const parsed = new URL(urlString);
    parsed.search = '';
    parsed.hash = '';
    
    let clean = parsed.toString().toLowerCase();
    
    // Forzar que terminen con barra si es dominio o estructura simple
    if (!clean.endsWith('/')) {
      clean += '/';
    }
    
    // Remover segmentos comunes que no diferencian posts (como "/comments/")
    clean = clean.replace(/\/comments\/$/, '/');
    
    return clean;
  } catch (e) {
    // Si no es URL válida (por ejemplo, es un path local o ID interno), devolver minúsculas limpias
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '') + '/';
  }
}

// --- Generador de Hash para deduplicar textos (por ej: posts sin URL estable) ---
function getContentHash(text) {
  if (!text) return '';
  // Limpiar texto para que ligeras diferencias de puntuación o emojis no evadan el hash
  const cleanText = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Quitar puntuación y emojis
    .replace(/\s+/g, '')     // Quitar todos los espacios
    .substring(0, 150);      // Tomar los primeros 150 chars
  
  return crypto.createHash('sha256').update(cleanText).digest('hex');
}

// --- MÉTODOS PÚBLICOS DE DEDUPLICACIÓN ---

// ── Comentarios ──

export async function addCommentMade(platform, rawUrl, postText, commentText) {
  await initDB();
  const postUrl = normalizeUrl(rawUrl);
  const postHash = getContentHash(postText);
  const commentHash = getContentHash(commentText);

  db.comments_made.push({
    platform: platform.toLowerCase(),
    postUrl,
    postHash,
    commentText,
    commentHash,
    commentedAt: new Date().toISOString()
  });
  await saveDB();
}

export async function hasCommentedPost(platform, rawUrl, postText) {
  await initDB();
  const postUrl = rawUrl ? normalizeUrl(rawUrl) : null;
  const postHash = postText ? getContentHash(postText) : null;

  return db.comments_made.some(c => {
    if (c.platform !== platform.toLowerCase()) return false;
    
    // Deduplicación por URL exacta
    if (postUrl && c.postUrl && c.postUrl === postUrl) return true;
    
    // Deduplicación por hash de contenido (mismo post de Facebook Groups re-compartido)
    if (postHash && c.postHash && c.postHash === postHash) return true;
    
    return false;
  });
}

export async function hasCommentTextBeenUsed(platform, commentText, limitCount = 10) {
  await initDB();
  const hash = getContentHash(commentText);
  
  // Buscar en los últimos limitCount comentarios de esa plataforma para evitar repeticiones sucesivas
  const recentComments = db.comments_made
    .filter(c => c.platform === platform.toLowerCase())
    .slice(-limitCount);
    
  return recentComments.some(c => c.commentHash === hash);
}

// ── Publicaciones Creadas ──

export async function addPostCreated(platform, target, rawUrl, postText) {
  await initDB();
  const postUrl = rawUrl ? normalizeUrl(rawUrl) : '';
  const postHash = getContentHash(postText);

  db.posts_created.push({
    platform: platform.toLowerCase(),
    target: target.toLowerCase(), // ej. "group_id" o "my_profile"
    postUrl,
    postHash,
    createdAt: new Date().toISOString()
  });
  await saveDB();
}

export async function hasPostedContent(platform, target, postText, maxDaysOld = 7) {
  await initDB();
  const postHash = getContentHash(postText);
  const limitTime = Date.now() - maxDaysOld * 24 * 60 * 60 * 1000;

  return db.posts_created.some(p => {
    if (p.platform !== platform.toLowerCase()) return false;
    if (p.target !== target.toLowerCase()) return false;
    
    const ageMs = new Date(p.createdAt).getTime();
    if (ageMs < limitTime) return false; // ya es viejo, se puede repetir
    
    return p.postHash === postHash;
  });
}

// --- CONTROL DE HORARIO OPERATIVO (Configurable / 24/7 o por horas) ---

export function isWithinHumanHours() {
  try {
    let timezone = 'America/Argentina/Buenos_Aires';
    let mode = 'scheduled'; // 'scheduled' | '24/7'
    let startHour = 8;
    let endHour = 23;
    
    // Buscar ig-config.json en múltiples rutas para compatibilidad
    const possiblePaths = [
      CONFIG_FILE,
      path.join(PROJECT_ROOT, '.agent', 'ig-config.json'),
      path.resolve(PROJECT_ROOT, '..', '.agent', 'ig-config.json'),
      '/home/biurato/Documentos/tradeshare/trade-share/.agent/ig-config.json'
    ];
    
    for (const p of possiblePaths) {
      if (fsSync.existsSync(p)) {
        try {
          const config = JSON.parse(fsSync.readFileSync(p, 'utf-8'));
          if (config.account?.timezone) timezone = config.account.timezone;
          if (config.workSchedule) {
            if (config.workSchedule.timezone) timezone = config.workSchedule.timezone;
            if (config.workSchedule.mode) mode = config.workSchedule.mode;
            if (typeof config.workSchedule.startHour === 'number') startHour = config.workSchedule.startHour;
            if (typeof config.workSchedule.endHour === 'number') endHour = config.workSchedule.endHour;
          } else if (config.human_hours) {
            if (config.human_hours.timezone) timezone = config.human_hours.timezone;
            if (typeof config.human_hours.start === 'number') startHour = config.human_hours.start;
            if (typeof config.human_hours.end === 'number') endHour = config.human_hours.end;
          }
          break;
        } catch {}
      }
    }
    
    if (mode === '24/7' || mode === 'always') {
      return true;
    }
    
    // Obtener la hora actual exacta en la zona horaria destino
    const fmt = new Intl.DateTimeFormat('es-AR', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    });
    
    const currentHour = parseInt(fmt.format(new Date()), 10);
    
    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Manejo de cruce de medianoche (ej. de 20:00 a 04:00)
      return currentHour >= startHour || currentHour < endHour;
    }
  } catch (e) {
    // Fallback: hora local del sistema
    const currentHour = new Date().getHours();
    return currentHour >= 8 && currentHour < 23;
  }
}

// Inicializar de inmediato al importar
await initDB();
