import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { 
  readPostsDB, savePostsDB, 
  readStatsDB, saveStatsDB, 
  readLeadsDB, saveLeadsDB, 
  readPromptsDB, savePromptsDB,
  readPitchTemplatesDB, savePitchTemplatesDB
} from './data-manager.mjs';
import { publishToIG } from './ig-publisher.mjs';
import { publishToThreads } from './threads-publisher.mjs';
import { generateTradingPrompt } from './prompt-engine.mjs';
import { generateDailyContent, getGeneratorStatus } from './content-auto-generator.mjs';
import { promptLibrary, getCaptionForPrompt } from './prompt-library.js';
import { B2B_TEMPLATES } from './outreach-templates.mjs';
import { PRODUCT_CATALOG } from './product-catalog.mjs';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const app = express();
const PORT = 5680; // El cockpit corre en el puerto 5680 para asegurar compatibilidad con lanzadores.

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Directorios de Medios configurables
const MEDIA_DIR_FEED = path.join(PROJECT_ROOT, 'public', 'images', 'feed');
const MEDIA_DIR_HISTORIAS = path.join(PROJECT_ROOT, 'public', 'images', 'historias');

const homedir = os.homedir();
const desktopFeedDir = path.join(homedir, 'Escritorio', 'media', 'feed');
const desktopStoriesDir = path.join(homedir, 'Escritorio', 'media', 'historias');

// Asegurar directorios de medios
if (!fs.existsSync(MEDIA_DIR_FEED)) fs.mkdirSync(MEDIA_DIR_FEED, { recursive: true });
if (!fs.existsSync(MEDIA_DIR_HISTORIAS)) fs.mkdirSync(MEDIA_DIR_HISTORIAS, { recursive: true });
async function publishToTradeShare(titulo, contenido, categoria, imagenUrl) {
  return new Promise((resolve, reject) => {
    const cleanTitulo = (titulo || 'Trading Mindset').replace(/"/g, '\\"');
    const cleanContenido = (contenido || '').replace(/"/g, '\\"');
    const cleanCategoria = (categoria || 'Psicología').replace(/"/g, '\\"');
    const cleanImagenUrl = imagenUrl ? imagenUrl : '';

    const argsObj = {
      titulo: cleanTitulo,
      contenido: cleanContenido,
      categoria: cleanCategoria,
      imagenUrl: cleanImagenUrl,
      userId: 'admin_braiurato',
      isAiAgent: false,
      sentiment: 'neutral'
    };

    const cmd = `npx convex run posts:createPost '${JSON.stringify(argsObj)}'`;
    console.log(`[TRADESHARE FEED] Publicando mediante Convex CLI...`);
    
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`❌ Error publicando en TradeShare Feed: ${err.message}`);
        return reject(err);
      }
      console.log(`✅ Publicado exitosamente en TradeShare Feed: ${stdout}`);
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch {
        resolve({ success: true });
      }
    });
  });
}

function resolveAndCopyImageForTradeShare(post, destinationType = 'feed') {
  // Intentar obtener una ruta de origen válida en disco
  let sourcePath = post.filepath || post.filename || '';
  if (!sourcePath) return '';

  // Si ya es un enlace HTTP, no hacemos copia
  if (sourcePath.startsWith('http')) return sourcePath;

  // Resolver ruta absoluta física
  let absSourcePath = sourcePath;
  if (!path.isAbsolute(absSourcePath)) {
    // Probar relativo al PROJECT_ROOT
    const testPath = path.join(PROJECT_ROOT, sourcePath);
    if (fs.existsSync(testPath)) {
      absSourcePath = testPath;
    } else {
      // Probar en dist/ o Escritorio/ si el string tiene la forma
      const baseName = path.basename(sourcePath);
      const testDesktopFeed = path.join(desktopFeedDir || '', baseName);
      const testDesktopStories = path.join(desktopStoriesDir || '', baseName);
      const testPublicFeed = path.join(MEDIA_DIR_FEED, baseName);
      const testPublicStories = path.join(MEDIA_DIR_HISTORIAS, baseName);
      const testDistFeed = path.join(PROJECT_ROOT, 'dist', 'images', 'feed', baseName);
      
      if (fs.existsSync(testDesktopFeed)) absSourcePath = testDesktopFeed;
      else if (fs.existsSync(testDesktopStories)) absSourcePath = testDesktopStories;
      else if (fs.existsSync(testPublicFeed)) absSourcePath = testPublicFeed;
      else if (fs.existsSync(testPublicStories)) absSourcePath = testPublicStories;
      else if (fs.existsSync(testDistFeed)) absSourcePath = testDistFeed;
    }
  }

  // Si a pesar de todo no existe el archivo origen
  if (!fs.existsSync(absSourcePath)) {
    console.warn(`⚠️ [IMAGE RESOLVER] Archivo origen no encontrado: ${sourcePath}`);
    // Intentar retornar el nombre relativo básico por si TradeShare ya lo sirve
    const baseName = path.basename(sourcePath);
    return destinationType === 'story' ? `/images/historias/${baseName}` : `/images/feed/${baseName}`;
  }

  // Copiar al public de TradeShare
  const baseName = path.basename(absSourcePath);
  const destDir = destinationType === 'story' ? MEDIA_DIR_HISTORIAS : MEDIA_DIR_FEED;
  const destPath = path.join(destDir, baseName);

  try {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    // Copiar sólo si no existe o es diferente
    let shouldCopy = true;
    if (fs.existsSync(destPath)) {
      const srcStat = fs.statSync(absSourcePath);
      const destStat = fs.statSync(destPath);
      if (srcStat.size === destStat.size) {
        shouldCopy = false;
      }
    }
    if (shouldCopy) {
      fs.copyFileSync(absSourcePath, destPath);
      console.log(`✅ [IMAGE RESOLVER] Copiado exitoso: ${absSourcePath} -> ${destPath}`);
    }
  } catch (err) {
    console.error(`⚠️ [IMAGE RESOLVER] Error copiando imagen:`, err.message);
  }

  return destinationType === 'story' ? `/images/historias/${baseName}` : `/images/feed/${baseName}`;
}

function logAIActivity(action, prompt, response, model = 'qwen2.5:7b') {
  const activityPath = path.join(PROJECT_ROOT, '.agent', 'local-ai-activity.json');
  let activityLog = [];
  try {
    if (fs.existsSync(activityPath)) {
      activityLog = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
    }
  } catch (e) {
    activityLog = [];
  }
  
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    prompt,
    response,
    model
  };
  
  activityLog.unshift(entry);
  
  // Limitar a los últimos 100 registros
  if (activityLog.length > 100) {
    activityLog = activityLog.slice(0, 100);
  }
  
  try {
    fs.writeFileSync(activityPath, JSON.stringify(activityLog, null, 2), 'utf8');
  } catch (err) {
    console.error(`⚠️ Error al escribir local-ai-activity.json:`, err.message);
  }
}

// Servir la carpeta public estática del frontend
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// Servir carpetas del Escritorio si existen para la Bóveda de Medios
if (fs.existsSync(desktopFeedDir)) {
  app.use('/images/feed/desktop', express.static(desktopFeedDir));
}
if (fs.existsSync(desktopStoriesDir)) {
  app.use('/images/historias/desktop', express.static(desktopStoriesDir));
}
// Servir carpeta de medios locales de productos (bot gestor / indicador)
app.use('/media', express.static(path.join(__dirname, 'media')));

// Redireccionar al Dashboard principal
app.get('/', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
});

// ==========================================
// Helper para escaneo recursivo de directorios de medios
// ==========================================
function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const absPath = path.join(dir, file);
    if (fs.statSync(absPath).isDirectory()) {
      getFilesRecursively(absPath, fileList);
    } else {
      fileList.push(absPath);
    }
  });
  return fileList;
}

/**
 * Endpoint para recibir eventos desde OpenClaw Webhooks
 */
app.post('/api/openclaw-event', (req, res) => {
  const eventData = req.body;
  console.log(`[OPENCLAW EVENT] Recibido evento: ${JSON.stringify(eventData)}`);
  
  // TODO: Implementar lógica de persistencia o actualización del dashboard
  
  res.status(200).json({ status: 'received' });
});

/**
 * Lista todos los archivos de ./public/images/feed y ./public/images/historias con metadata del CRM
 */
app.get('/api/media', (req, res) => {
  try {
    const db = readPostsDB();
    const mediaList = [];
    const extList = ['.png', '.jpg', '.jpeg', '.webp'];

    // Escanear feed/ con prioridad al Escritorio para de-duplicar por nombre de archivo
    const seenFeedFiles = new Set();
    const scanFeedDirs = [];
    if (fs.existsSync(desktopFeedDir)) {
      scanFeedDirs.push({ dir: desktopFeedDir, urlPrefix: '/images/feed/desktop/' });
    }
    scanFeedDirs.push({ dir: MEDIA_DIR_FEED, urlPrefix: '/images/feed/' });

    scanFeedDirs.forEach(({ dir, urlPrefix }) => {
      if (fs.existsSync(dir)) {
        const allFiles = getFilesRecursively(dir);
        allFiles.forEach(absPath => {
          const ext = path.extname(absPath).toLowerCase();
          if (!extList.includes(ext)) return;

          const file = path.basename(absPath);
          if (seenFeedFiles.has(file)) return;
          seenFeedFiles.add(file);

          const stats = fs.statSync(absPath);
          const relativePath = path.relative(dir, absPath);
          const serveUrl = urlPrefix + relativePath.replace(/\\/g, '/');

          let postInfo = db.posts.find(p => 
            p.filename === file || 
            p.filename === serveUrl || 
            p.filepath === absPath ||
            path.basename(p.filename) === file
          );
          if (!postInfo) {
            const isAuto = file.startsWith('chatgpt') || file.startsWith('gemini') || file.startsWith('manus') || file.startsWith('meta');
            const category = isAuto ? "AI" : "General";
            const tags = isAuto ? ["auto-generated", file.split('_')[0]] : ["manual"];
            const captionText = getCaptionForPrompt(file);

            postInfo = {
              id: `post_feed_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              filename: serveUrl,
              filepath: absPath,
              source: isAuto ? "auto-generated" : "manual",
              title: file.replace(ext, '').replace(/[-_]/g, ' '),
              category: category,
              tags: tags,
              status: isAuto ? "Draft" : "Ready",
              captions: [{
                id: "c1",
                label: "Caption Principal",
                text: captionText,
                isDefault: true,
                createdAt: new Date().toISOString()
              }],
              scheduled: [],
              published: [],
              createdAt: stats.birthtime.toISOString()
            };
            db.posts.push(postInfo);
          }

          mediaList.push({
            ...postInfo,
            serveUrl,
            mtime: stats.mtime.toISOString()
          });
        });
      }
    });

    // Escanear historias/ con prioridad al Escritorio para de-duplicar por nombre de archivo
    const seenStoriesFiles = new Set();
    const scanStoriesDirs = [];
    if (fs.existsSync(desktopStoriesDir)) {
      scanStoriesDirs.push({ dir: desktopStoriesDir, urlPrefix: '/images/historias/desktop/' });
    }
    scanStoriesDirs.push({ dir: MEDIA_DIR_HISTORIAS, urlPrefix: '/images/historias/' });

    scanStoriesDirs.forEach(({ dir, urlPrefix }) => {
      if (fs.existsSync(dir)) {
        const allFiles = getFilesRecursively(dir);
        allFiles.forEach(absPath => {
          const ext = path.extname(absPath).toLowerCase();
          if (!extList.includes(ext)) return;

          const file = path.basename(absPath);
          if (seenStoriesFiles.has(file)) return;
          seenStoriesFiles.add(file);

          const stats = fs.statSync(absPath);
          const relativePath = path.relative(dir, absPath);
          const serveUrl = urlPrefix + relativePath.replace(/\\/g, '/');

          let postInfo = db.posts.find(p => 
            p.filename === file || 
            p.filename === serveUrl || 
            p.filepath === absPath ||
            path.basename(p.filename) === file
          );
          if (!postInfo) {
            const isAuto = file.startsWith('chatgpt') || file.startsWith('gemini') || file.startsWith('manus') || file.startsWith('meta');
            const category = isAuto ? "AI" : "General";
            const tags = isAuto ? ["auto-generated", file.split('_')[0]] : ["manual"];
            const captionText = getCaptionForPrompt(file);

            postInfo = {
              id: `post_hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              filename: serveUrl,
              filepath: absPath,
              source: isAuto ? "auto-generated" : "manual",
              title: file.replace(ext, '').replace(/[-_]/g, ' '),
              category: category,
              tags: tags,
              status: isAuto ? "Draft" : "Ready",
              captions: [{
                id: "c1",
                label: "Caption Principal",
                text: captionText,
                isDefault: true,
                createdAt: new Date().toISOString()
              }],
              scheduled: [],
              published: [],
              createdAt: stats.birthtime.toISOString()
            };
            db.posts.push(postInfo);
          }

          mediaList.push({
            ...postInfo,
            serveUrl,
            mtime: stats.mtime.toISOString()
          });
        });
      }
    });

    // Incorporar imágenes de productos oficiales (Bot Gestor e Indicador)
    const seenProductFiles = new Set();
    PRODUCT_CATALOG.forEach(prod => {
      if (fs.existsSync(prod.imagen)) {
        const file = path.basename(prod.imagen);
        const relDir = path.basename(path.dirname(prod.imagen));
        const prodKey = `${relDir}/${file}`;
        if (seenProductFiles.has(prodKey)) return;
        seenProductFiles.add(prodKey);

        const stats = fs.statSync(prod.imagen);
        const serveUrl = `/media/${encodeURIComponent(relDir)}/${encodeURIComponent(file)}`;

        let postInfo = db.posts.find(p => p.id === prod.id || p.filepath === prod.imagen);
        if (!postInfo) {
          postInfo = {
            id: prod.id,
            filename: serveUrl,
            filepath: prod.imagen,
            source: "product-catalog",
            title: prod.titulo,
            category: "Producto",
            tags: prod.tags,
            status: "Ready",
            captions: [{
              id: "c1",
              label: "Copy de Producto",
              text: prod.copy,
              isDefault: true,
              platform_variants: {
                ig_feed: prod.copy,
                ig_story: prod.titulo,
                threads: prod.copy
              },
              createdAt: stats.birthtime.toISOString()
            }],
            scheduled: [],
            published: [],
            createdAt: stats.birthtime.toISOString()
          };
          db.posts.push(postInfo);
        }

        mediaList.push({
          ...postInfo,
          serveUrl,
          mtime: stats.mtime.toISOString()
        });
      }
    });

    // Curar/Autoreparar posts sin captions o con caption igual al título
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

    db.posts.forEach(post => {
      if (!post.captions || post.captions.length === 0) {
        const template = COPIES_LIBRARY[Math.floor(Math.random() * COPIES_LIBRARY.length)];
        const cta = CTAS[Math.floor(Math.random() * CTAS.length)];
        const captionText = `${template.copy}\n\n👉 ${cta}`;
        
        post.captions = [{
          id: "c1",
          label: "Caption Principal",
          text: captionText,
          isDefault: true,
          platform_variants: {
            ig_feed: captionText,
            ig_story: template.frase,
            threads: captionText
          },
          createdAt: new Date().toISOString()
        }];
      } else {
        const firstCap = post.captions[0];
        const textLength = firstCap && firstCap.text ? firstCap.text.trim().length : 0;
        const isShort = textLength < 80;
        const isSameAsTitle = firstCap && firstCap.text && firstCap.text.trim().toLowerCase() === post.title.trim().toLowerCase();

        if (firstCap && (!firstCap.text || isShort || isSameAsTitle)) {
          const template = COPIES_LIBRARY[Math.floor(Math.random() * COPIES_LIBRARY.length)];
          const cta = CTAS[Math.floor(Math.random() * CTAS.length)];
          const captionText = `${template.copy}\n\n👉 ${cta}`;
          
          firstCap.text = captionText;
          if (!firstCap.platform_variants) {
            firstCap.platform_variants = {};
          }
          firstCap.platform_variants.ig_feed = captionText;
          firstCap.platform_variants.ig_story = template.frase;
          firstCap.platform_variants.threads = captionText;
        }
      }
    });

    savePostsDB(db);
    // Ordenar por mtime descendente
    mediaList.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json({ success: true, media: mediaList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Sirve imagen estática por nombre buscando en feed e historias
 */
app.get('/api/media/file/:filename', (req, res) => {
  const { filename } = req.params;
  const decoded = decodeURIComponent(filename);
  const base = path.basename(decoded);
  
  // Buscar en feed
  const pathFeedBase = path.join(MEDIA_DIR_FEED, base);
  if (fs.existsSync(pathFeedBase)) {
    return res.sendFile(pathFeedBase);
  }

  // Buscar en historias
  const pathHistBase = path.join(MEDIA_DIR_HISTORIAS, base);
  if (fs.existsSync(pathHistBase)) {
    return res.sendFile(pathHistBase);
  }

  // Buscar en Bot Gestor e Indicador
  const pathBot = path.join(__dirname, 'media', 'bot gestor', base);
  if (fs.existsSync(pathBot)) {
    return res.sendFile(pathBot);
  }

  const pathIndicador = path.join(__dirname, 'media', 'indicador', base);
  if (fs.existsSync(pathIndicador)) {
    return res.sendFile(pathIndicador);
  }

  res.status(404).json({ success: false, error: "Archivo de imagen no encontrado." });
});

/**
 * Sube una nueva imagen en base64 directamente a feed/
 */
app.post('/api/media/upload', (req, res) => {
  const { filename, base64 } = req.body;
  if (!filename || !base64) return res.status(400).json({ error: "Faltan parámetros filename o base64." });

  try {
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, 'base64');
    const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const targetPath = path.join(MEDIA_DIR_FEED, safeFilename);

    fs.writeFileSync(targetPath, buffer);

    const db = readPostsDB();
    const captionText = getCaptionForPrompt(filename);

    const newPost = {
      id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      filename: `/images/feed/${safeFilename}`,
      filepath: `./public/images/feed/${safeFilename}`,
      source: "manual",
      title: filename.split('.')[0].replace(/[-_]/g, ' '),
      category: "General",
      tags: ["manual"],
      status: "Ready",
      captions: [{
        id: "c1",
        label: "Caption Principal",
        text: captionText,
        isDefault: true,
        createdAt: new Date().toISOString()
      }],
      scheduled: [],
      published: [],
      createdAt: new Date().toISOString()
    };
    db.posts.push(newPost);
    savePostsDB(db);

    res.json({ success: true, post: newPost });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 📝 SECCIÓN 2 — POSTS ENDPOINTS
// ==========================================

app.get('/api/posts', (req, res) => {
  const db = readPostsDB();
  res.json({ success: true, posts: db.posts });
});

app.post('/api/posts/create', (req, res) => {
  const { filename, filepath, title, category } = req.body;
  if (!filename || !filepath) return res.status(400).json({ error: "Faltan parámetros filename o filepath." });

  const db = readPostsDB();
  const newPost = {
    id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    filename,
    filepath,
    source: "manual",
    title: title || "Nuevo Aporte",
    category: category || "General",
    tags: [category || "General"],
    status: "Draft",
    captions: [{
      id: "c1",
      label: "Caption Principal",
      text: "⚡ ¡Trading de verdad en TradeShare!",
      isDefault: true,
      createdAt: new Date().toISOString()
    }],
    scheduled: [],
    published: [],
    createdAt: new Date().toISOString()
  };

  db.posts.push(newPost);
  savePostsDB(db);
  res.json({ success: true, post: newPost });
});

app.put('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  const { title, category, tags, status, recycleAfterDays } = req.body;

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  if (title !== undefined) post.title = title;
  if (category !== undefined) post.category = category;
  if (tags !== undefined) post.tags = tags;
  if (status !== undefined) post.status = status;
  if (recycleAfterDays !== undefined) post.recycleAfterDays = recycleAfterDays;

  savePostsDB(db);
  res.json({ success: true, post });
});

app.delete('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  const db = readPostsDB();
  const index = db.posts.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: "Post no encontrado" });

  const post = db.posts[index];
  // Eliminar archivo físico si está en media/manual
  try {
    const absPath = path.join(PROJECT_ROOT, post.filepath);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (e) {}

  db.posts.splice(index, 1);
  savePostsDB(db);
  res.json({ success: true, message: "Post eliminado." });
});

app.post('/api/posts/:id/caption', (req, res) => {
  const { id } = req.params;
  const { text, label, platform_variants } = req.body;
  if (!text) return res.status(400).json({ error: "Falta parámetro text." });

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  const cid = `c_${Date.now()}`;
  const newCaption = {
    id: cid,
    label: label || `Variante ${post.captions.length + 1}`,
    text,
    platform_variants: platform_variants || {
      ig_feed: text,
      ig_story: text.substring(0, 80),
      threads: text,
      tradeshare_free: text,
      tradeshare_vip: text
    },
    isDefault: post.captions.length === 0,
    createdAt: new Date().toISOString()
  };

  post.captions.push(newCaption);
  savePostsDB(db);
  res.json({ success: true, post, caption: newCaption });
});

app.put('/api/posts/:id/caption/:cid', (req, res) => {
  const { id, cid } = req.params;
  const { text, label, platform_variants, isDefault } = req.body;

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  const caption = post.captions.find(c => c.id === cid);
  if (!caption) return res.status(404).json({ error: "Caption no encontrado" });

  if (text !== undefined) caption.text = text;
  if (label !== undefined) caption.label = label;
  if (platform_variants !== undefined) caption.platform_variants = platform_variants;
  if (isDefault === true) {
    post.captions.forEach(c => c.isDefault = false);
    caption.isDefault = true;
  }

  savePostsDB(db);
  res.json({ success: true, post });
});

app.delete('/api/posts/:id/caption/:cid', (req, res) => {
  const { id, cid } = req.params;

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  const index = post.captions.findIndex(c => c.id === cid);
  if (index === -1) return res.status(404).json({ error: "Caption no encontrado" });

  post.captions.splice(index, 1);
  if (post.captions.length > 0 && !post.captions.some(c => c.isDefault)) {
    post.captions[0].isDefault = true;
  }

  savePostsDB(db);
  res.json({ success: true, post });
});

// Endpoint para mover posts física y lógicamente por Temas y Secuencias
app.post('/api/posts/:id/move', (req, res) => {
  const { id } = req.params;
  const { theme, sequence } = req.body;

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  const oldFilepath = post.filepath;

  if (theme !== undefined) post.theme = theme;
  if (sequence !== undefined) post.sequence = sequence;

  // Intentar mover el archivo físicamente en el disco
  if (oldFilepath && fs.existsSync(oldFilepath)) {
    try {
      const ext = path.extname(oldFilepath);
      const baseName = path.basename(oldFilepath);

      const isHistoria = oldFilepath.includes('historias');
      const baseDir = isHistoria ? MEDIA_DIR_HISTORIAS : MEDIA_DIR_FEED;
      const serveBase = isHistoria ? '/images/historias' : '/images/feed';

      let targetSubpath = '';
      if (theme) {
        targetSubpath = path.join(targetSubpath, theme);
        if (sequence) {
          targetSubpath = path.join(targetSubpath, sequence);
        }
      }

      const targetDir = path.join(baseDir, targetSubpath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const targetFilepath = path.join(targetDir, baseName);
      fs.renameSync(oldFilepath, targetFilepath);

      const relativeSubpath = targetSubpath ? targetSubpath.replace(/\\/g, '/') + '/' : '';
      post.filepath = `./public${serveBase}/${relativeSubpath}${baseName}`;
      post.filename = `${serveBase}/${relativeSubpath}${baseName}`;
    } catch (e) {
      console.error(`Error moviendo archivo físico para el post ${id}:`, e.message);
    }
  }

  savePostsDB(db);
  res.json({ success: true, post });
});

// ==========================================
// 📤 SECCIÓN 3 — PUBLICACIÓN ENDPOINTS
// ==========================================

app.post('/api/posts/:id/publish', async (req, res) => {
  const { id } = req.params;
  const { destinations, captionText, account } = req.body;
  const selectedAccount = account || 'tradeshare.ok';

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  const textToPublish = captionText || post.captions.find(c => c.isDefault)?.text || post.captions[0]?.text || '';
  
  // Imagen absoluta para Playwright con fallback robusto
  let absoluteImagePath = post.filepath || post.filename || '';
  if (absoluteImagePath.startsWith('/generated_posts') || absoluteImagePath.startsWith('/images')) {
    absoluteImagePath = `./public${absoluteImagePath}`;
  }
  if (absoluteImagePath && !absoluteImagePath.startsWith('/home') && !absoluteImagePath.startsWith('http')) {
    absoluteImagePath = path.join(PROJECT_ROOT, absoluteImagePath);
  }

  const results = {};

  if (destinations.includes('ig_feed')) {
    try {
      await publishToIG(absoluteImagePath, textToPublish, 'feed', selectedAccount, id);
      results.ig_feed = { success: true };
    } catch (e) {
      results.ig_feed = { success: false, error: e.message };
    }
  }

  if (destinations.includes('ig_story')) {
    try {
      await publishToIG(absoluteImagePath, textToPublish, 'story', selectedAccount, id);
      results.ig_story = { success: true };
    } catch (e) {
      results.ig_story = { success: false, error: e.message };
    }
  }

  if (destinations.includes('threads')) {
    try {
      await publishToThreads(textToPublish, absoluteImagePath);
      results.threads = { success: true };
    } catch (e) {
      results.threads = { success: false, error: e.message };
    }
  }

  if (destinations.includes('tradeshare')) {
    try {
      const isStory = post.category === 'Historias' || post.filepath?.includes('historias') || post.filename?.includes('historias');
      const finalImageUrl = resolveAndCopyImageForTradeShare(post, isStory ? 'story' : 'feed');

      await publishToTradeShare(post.title, textToPublish, post.category, finalImageUrl);
      results.tradeshare = { success: true };
    } catch (e) {
      results.tradeshare = { success: false, error: e.message };
    }
  }

  const successKeys = Object.keys(results).filter(k => results[k].success);
  if (successKeys.length > 0) {
    post.status = "Posted";
    post.published.push({
      publishedAt: new Date().toISOString(),
      destinations: successKeys,
      captionId: post.captions.find(c => c.isDefault)?.id || "c1",
      metrics: { likes: 0, comments: 0, reach: 0 }
    });
    savePostsDB(db);
  }

  res.json({ success: true, results });
});

app.post('/api/posts/:id/schedule', (req, res) => {
  const { id } = req.params;
  const { scheduledAt, destinations, type } = req.body;
  if (!scheduledAt || !destinations) return res.status(400).json({ error: "Faltan parámetros." });

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado." });

  const schedId = `s_${Date.now()}`;
  post.scheduled.push({
    id: schedId,
    scheduledAt,
    destinations,
    captionId: post.captions.find(c => c.isDefault)?.id || "c1",
    status: "pending",
    type: type || "feed"
  });
  post.status = "Scheduled";

  savePostsDB(db);
  res.json({ success: true, post });
});

app.post('/api/posts/:id/republish', (req, res) => {
  const { id } = req.params;
  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post no encontrado." });

  post.status = "Ready";
  savePostsDB(db);
  res.json({ success: true, post });
});

app.get('/api/schedule', (req, res) => {
  const db = readPostsDB();
  const pending = [];

  db.posts.forEach(post => {
    post.scheduled.forEach(sched => {
      if (sched.status === 'pending') {
        pending.push({
          id: post.id,
          schedId: sched.id,
          title: post.title,
          filename: post.filename,
          filepath: post.filepath,
          scheduledAt: sched.scheduledAt,
          destinations: sched.destinations,
          type: sched.type || 'feed',
          caption: post.captions.find(c => c.id === sched.captionId)?.text || post.captions[0]?.text || ''
        });
      }
    });
  });

  pending.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  res.json({ success: true, schedule: pending });
});

// ==========================================
// 💡 SECCIÓN 4 — PROMPTS ENDPOINTS
// ==========================================

app.get('/api/prompts', (req, res) => {
  const db = readPromptsDB();
  
  // Combinar los prompts fijos de prompt-library con los dinámicos del JSON
  const fixedList = promptLibrary.map((text, i) => ({
    id: `fixed_${i}`,
    title: `Prompt Fijo #${i+1}`,
    prompt: text,
    caption: getCaptionForPrompt(text, i),
    category: "Fijo",
    source: "library"
  }));

  const allPrompts = [
    ...db.prompts.map(p => ({ ...p, caption: p.caption || getCaptionForPrompt(p.prompt) })),
    ...fixedList
  ];
  res.json({ success: true, prompts: allPrompts });
});

app.post('/api/prompts', (req, res) => {
  const { title, prompt, category } = req.body;
  if (!prompt) return res.status(400).json({ error: "Falta parámetro prompt." });

  const db = readPromptsDB();
  const newPrompt = {
    id: `prompt_${Date.now()}`,
    title: title || `Prompt Generado ${db.prompts.length + 1}`,
    prompt,
    category: category || "General",
    source: "custom"
  };

  db.prompts.push(newPrompt);
  savePromptsDB(db);
  res.json({ success: true, prompt: newPrompt });
});

app.put('/api/prompts/:id', (req, res) => {
  const { id } = req.params;
  const { title, prompt, category } = req.body;

  const db = readPromptsDB();
  const promptObj = db.prompts.find(p => p.id === id);
  if (!promptObj) return res.status(404).json({ error: "Prompt personalizado no encontrado." });

  if (title !== undefined) promptObj.title = title;
  if (prompt !== undefined) promptObj.prompt = prompt;
  if (category !== undefined) promptObj.category = category;

  savePromptsDB(db);
  res.json({ success: true, prompt: promptObj });
});

app.delete('/api/prompts/:id', (req, res) => {
  const { id } = req.params;
  const db = readPromptsDB();
  const index = db.prompts.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: "Prompt personalizado no encontrado." });

  db.prompts.splice(index, 1);
  savePromptsDB(db);
  res.json({ success: true, message: "Prompt personalizado eliminado." });
});

// ==========================================
// 💬 SECCIÓN 4.5 — PITCH TEMPLATES ENDPOINTS (DMs)
// ==========================================

app.get('/api/pitch-templates', (req, res) => {
  const db = readPitchTemplatesDB();
  res.json({ success: true, templates: db.templates || [] });
});

app.post('/api/pitch-templates', (req, res) => {
  const { name, category, text } = req.body;
  if (!name || !text) return res.status(400).json({ error: "Faltan parámetros" });

  const db = readPitchTemplatesDB();
  const newTemplate = {
    id: `pitch_${Date.now()}`,
    name,
    category: category || "General",
    text
  };

  db.templates.push(newTemplate);
  savePitchTemplatesDB(db);
  res.json({ success: true, template: newTemplate });
});

app.put('/api/pitch-templates/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, text } = req.body;
  
  const db = readPitchTemplatesDB();
  const template = db.templates.find(t => t.id === id);
  if (!template) return res.status(404).json({ error: "Plantilla no encontrada" });

  if (name !== undefined) template.name = name;
  if (category !== undefined) template.category = category;
  if (text !== undefined) template.text = text;

  savePitchTemplatesDB(db);
  res.json({ success: true, template });
});

app.delete('/api/pitch-templates/:id', (req, res) => {
  const { id } = req.params;
  const db = readPitchTemplatesDB();
  const index = db.templates.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: "Plantilla no encontrada" });

  db.templates.splice(index, 1);
  savePitchTemplatesDB(db);
  res.json({ success: true, message: "Plantilla eliminada con éxito." });
});

// Helper de respuestas de marketing REALES via OpenClaw/Ollama
async function getExpertMarketingReply(prompt) {
    const config = getIGConfig();
    let activeModel = config.activeModel || 'ollama/qwen2.5:7b';
    if (!activeModel.startsWith('ollama/')) {
      activeModel = `ollama/${activeModel}`;
    }
    const systemPersona = config.prompts?.system_persona || 'Eres un experto en Growth Marketing para una plataforma de Trading Social llamada TradeShare. Genera respuestas concisas, profesionales y optimizadas para redes sociales.';

    try {
      console.log('🔗 Calling OpenClaw Gateway...');
      const response = await fetch('http://localhost:18789/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemPersona },
            { role: 'user', content: prompt }
          ]
        })
      });
      
      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ OpenClaw response received.');
      const reply = data.choices[0].message.content;
      logAIActivity('expert-reply', prompt, reply, activeModel);
      return reply;
    } catch (e) {
      console.warn(`⚠️ OpenClaw failed, falling back to direct Ollama: ${e.message}`);
      const cleanModel = activeModel.replace(/^ollama\//, '');
      const response = await fetch('http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          messages: [
            { role: 'system', content: systemPersona },
            { role: 'user', content: prompt }
          ],
          stream: false
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Both OpenClaw and Ollama failed. Ollama error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      console.log('✅ Ollama direct response received.');
      const reply = data.choices[0].message.content;
      logAIActivity('expert-reply (fallback)', prompt, reply, cleanModel);
      return reply;
    }
}

// 🧠 SECCIÓN 5 — IA ENDPOINTS
// ==========================================

app.post('/api/ai/generate-caption', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Falta prompt para generar caption." });

  console.log(`🤖 [IA GEN] Generando caption real con OpenClaw para: "${prompt}"`);
  try {
    const reply = await getExpertMarketingReply(prompt);
    res.json({ success: true, caption: reply });
  } catch (error) {
    console.error("🤖 [IA GEN Error]", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const config = getIGConfig();
  const defaultModel = config.activeModel ? (config.activeModel.startsWith('ollama/') ? config.activeModel : `ollama/${config.activeModel}`) : 'ollama/qwen2.5:7b';
  const { message, model = defaultModel } = req.body;
  if (!message) return res.status(400).json({ error: "Falta mensaje." });

  const systemPersona = config.prompts?.system_persona || 'Eres el asistente de ventas de TradeShare, una plataforma de trading para la comunidad hispana. Tu tono es cercano, profesional y motivador. Nunca usás jerga agresiva ni prometés ganancias garantizadas. Respondés siempre en español rioplatense (vos/sos). Máximo 2 oraciones.';

  try {
    let reply = '';
    try {
      console.log('🔗 Calling OpenClaw for AI chat...');
      const response = await fetch('http://localhost:18789/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPersona },
            { role: 'user', content: message }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`OpenClaw responded with status ${response.status}`);
      }
      const data = await response.json();
      reply = data.choices[0].message.content;
      logAIActivity('chat-copilot', message, reply, model);
    } catch (openClawError) {
      console.warn(`⚠️ OpenClaw failed, trying direct Ollama fallback: ${openClawError.message}`);
      const cleanModel = model.replace(/^ollama\//, '');
      const response = await fetch('http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          messages: [
            { role: 'system', content: systemPersona },
            { role: 'user', content: message }
          ],
          stream: false
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Both OpenClaw and Ollama failed. Ollama error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      reply = data.choices[0].message.content;
      logAIActivity('chat-copilot (fallback)', message, reply, cleanModel);
    }
    res.json({ success: true, reply });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/ai/generate-image', (req, res) => {
  const { prompt, provider } = req.body;
  if (!prompt || !provider) return res.status(400).json({ error: "Faltan parámetros prompt o provider." });

  let scriptName = 'gemini-generator.mjs';
  if (provider === 'chatgpt') scriptName = 'chatgpt-generator.mjs';
  else if (provider === 'meta') scriptName = 'meta-generator.mjs';
  else if (provider === 'arena') scriptName = 'arena-generator.mjs';
  else if (provider === 'manus') scriptName = 'manus-generator.mjs';

  console.log(`🤖 [IA GEN] Iniciando generación manual con ${provider.toUpperCase()}: "${prompt}"`);

  // Lanzar el subproceso del generador elegido
  const cmd = `node automatizacion-redes/${scriptName} --topic="${prompt.replace(/"/g, '\\"')}" --publish=false`;
  
  exec(cmd, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
    if (err) {
      console.error("🤖 [IA GEN Error]", err.message);
      return res.json({ success: false, error: err.message });
    }
    
    // Escanear la bóveda marketing_vault para encontrar el último guardado
    const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');
    if (fs.existsSync(vaultPath)) {
      try {
        const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
        const newest = vault[0]; // Las imágenes se unshiftan al inicio de la lista
        return res.json({ success: true, post: newest, log: stdout });
      } catch (e) {}
    }
    res.json({ success: true, log: stdout });
  });
});

app.post('/api/ai/generate-prompt', (req, res) => {
  const { category, emotion, style, concept, color } = req.body;
  if (!category) return res.status(400).json({ error: "Falta parámetro category." });

  const promptText = generateTradingPrompt(category, { emotion, style, concept, color });
  res.json({ success: true, prompt: promptText });
});

// ==========================================
// 📊 SECCIÓN 6 — ESTADÍSTICAS ENDPOINTS
// ==========================================

app.get('/api/stats', (req, res) => {
  const stats = readStatsDB();
  
  // Inicialización defensiva
  stats.bots = stats.bots || {};
  stats.bots.daemon = stats.bots.daemon || { status: 'offline' };
  stats.bots.threadsOutreach = stats.bots.threadsOutreach || { status: 'offline' };
  stats.bots.threadsQuotes = stats.bots.threadsQuotes || { status: 'offline' };
  stats.bots.scheduler = stats.bots.scheduler || { status: 'offline' };
  stats.bots.facebookGroups = stats.bots.facebookGroups || { status: 'offline' };

  // Consultar PM2 en caliente
  exec('npx pm2 jlist', (err, stdout) => {
    if (!err) {
      try {
        const pm2List = JSON.parse(stdout);
        pm2List.forEach(proc => {
          if (proc.name === 'tradeshare-playwriter-daemon') {
            stats.bots.daemon.status = proc.pm2_env.status;
          }
          if (proc.name === 'tradeshare-threads-outreach') {
            stats.bots.threadsOutreach.status = proc.pm2_env.status;
          }
          if (proc.name === 'tradeshare-threads-quotes') {
            stats.bots.threadsQuotes.status = proc.pm2_env.status;
          }
          if (proc.name === 'tradeshare-scheduler') {
            stats.bots.scheduler.status = proc.pm2_env.status;
          }
          if (proc.name === 'tradeshare-facebook-groups') {
            stats.bots.facebookGroups.status = proc.pm2_env.status;
          }
        });
        const cfg = getIGConfig();
        stats.bots.generator = { status: cfg.autoGeneratorEnabled ? 'online' : 'offline' };
        saveStatsDB(stats);
      } catch (e) {}
    }
    res.json({ success: true, stats });
  });
});

app.post('/api/stats/update', (req, res) => {
  const updates = req.body;
  const stats = readStatsDB();
  
  Object.keys(updates).forEach(key => {
    stats[key] = updates[key];
  });

  saveStatsDB(stats);
  res.json({ success: true, stats });
});

// ==========================================
// 💼 SECCIÓN 7 — LEADS CRM ENDPOINTS
// ==========================================

app.get('/api/leads', (req, res) => {
  const db = readLeadsDB();
  res.json({ success: true, leads: db.leads || [], b2b_leads: db.b2b_leads || [] });
});

app.post('/api/leads', (req, res) => {
  const { username, platform, source, status, notes } = req.body;
  if (!username) return res.status(400).json({ error: "Falta username de lead." });

  const db = readLeadsDB();
  const newLead = {
    id: `lead_${Date.now()}`,
    username: username.startsWith('@') ? username : `@${username}`,
    platform: platform || "Instagram",
    source: source || "Manual",
    status: status || "Detectado", // Etapas: Detectado | Comentado | Respondió | DM Enviado | Entró Comunidad | Convertido
    notes: notes || "",
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  db.leads.push(newLead);
  saveLeadsDB(db);
  res.json({ success: true, lead: newLead });
});

app.put('/api/leads/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const db = readLeadsDB();
  const lead = db.leads.find(l => l.id === id);
  if (!lead) return res.status(404).json({ error: "Lead no encontrado." });

  if (status !== undefined) lead.status = status;
  if (notes !== undefined) lead.notes = notes;
  lead.updatedAt = new Date().toISOString();

  saveLeadsDB(db);
  res.json({ success: true, lead });
});

app.get('/api/leads/pipeline', (req, res) => {
  const db = readLeadsDB();
  const stages = {
    "Detectado": [],
    "Comentado": [],
    "Respondió": [],
    "DM Enviado": [],
    "Entró Comunidad": [],
    "Convertido": []
  };

  db.leads.forEach(lead => {
    if (stages[lead.status]) {
      stages[lead.status].push(lead);
    } else {
      stages["Detectado"].push(lead);
    }
  });

  res.json({ success: true, pipeline: stages });
});

// ==========================================
// 🎯 SECCIÓN 7B — OUTREACH B2B ENDPOINTS
// ==========================================

const renderB2BTemplate = (template, lead) => {
  const username = (lead.username || '').replace(/^@/, '');
  return template
    .replaceAll('{username}', username)
    .replaceAll('{tema_detectado}', lead.detectedCategory || lead.tema_detectado || 'trading');
};

app.get('/api/outreach/targets', (req, res) => {
  const db = readLeadsDB();
  res.json({ success: true, targets: db.b2b_leads || [] });
});

app.post('/api/outreach/targets', (req, res) => {
  const { usernames, username, platform, detectedCategory, estimatedFollowers, notes } = req.body;
  const rawTargets = Array.isArray(usernames) ? usernames : String(usernames || username || '').split(/\r?\n|,/);
  const cleaned = rawTargets.map(u => String(u).trim()).filter(Boolean);
  if (cleaned.length === 0) return res.status(400).json({ success: false, error: 'Falta al menos un username.' });

  const db = readLeadsDB();
  db.b2b_leads = db.b2b_leads || [];
  const created = [];

  cleaned.forEach(raw => {
    const normalized = raw.startsWith('@') ? raw : `@${raw}`;
    const existing = db.b2b_leads.find(l => l.username.toLowerCase() === normalized.toLowerCase());
    if (existing) return;
    const lead = {
      id: `b2b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      username: normalized,
      platform: platform || 'threads',
      detectedCategory: detectedCategory || 'trading',
      estimatedFollowers: Number(estimatedFollowers) || 0,
      status: 'pending',
      pipeline_stage: 'Pendiente',
      messages_sent: [],
      response: null,
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.b2b_leads.push(lead);
    created.push(lead);
  });

  saveLeadsDB(db);
  res.json({ success: true, created, targets: db.b2b_leads });
});

app.get('/api/outreach/templates', (req, res) => {
  res.json({ success: true, templates: B2B_TEMPLATES });
});

app.put('/api/outreach/templates/:id', (req, res) => {
  const { id } = req.params;
  const template = Object.values(B2B_TEMPLATES).find(t => t.id === id || t.name === id) || B2B_TEMPLATES[id];
  if (!template) return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
  if (req.body.name) template.name = req.body.name;
  if (req.body.subject !== undefined) template.subject = req.body.subject;
  if (req.body.text) template.text = req.body.text;
  res.json({ success: true, template });
});

app.get('/api/outreach/stats', (req, res) => {
  const db = readLeadsDB();
  const targets = db.b2b_leads || [];
  const byStage = targets.reduce((acc, lead) => {
    const stage = lead.pipeline_stage || 'Pendiente';
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});
  res.json({
    success: true,
    stats: {
      total: targets.length,
      pending: targets.filter(l => l.pipeline_stage === 'Pendiente').length,
      sent: targets.filter(l => l.pipeline_stage === 'Contactado').length,
      responded: targets.filter(l => l.pipeline_stage === 'Respondió').length,
      converted: targets.filter(l => l.pipeline_stage === 'Convertido').length,
      byStage
    }
  });
});

app.post('/api/outreach/send/:username', async (req, res) => {
  const cleanUser = req.params.username.replace('@', '').trim();
  const { templateId = 'b2b_01', platform = 'instagram', tema_detectado } = req.body || {};
  const db = readLeadsDB();
  db.b2b_leads = db.b2b_leads || [];
  let lead = db.b2b_leads.find(l => l.username.toLowerCase() === `@${cleanUser.toLowerCase()}`);
  if (!lead) {
    lead = {
      id: `b2b_${Date.now()}`,
      username: `@${cleanUser}`,
      platform,
      detectedCategory: tema_detectado || 'trading',
      estimatedFollowers: 0,
      status: 'pending',
      pipeline_stage: 'Pendiente',
      messages_sent: [],
      response: null,
      notes: '',
      createdAt: new Date().toISOString()
    };
    db.b2b_leads.push(lead);
  }

  const template = Object.values(B2B_TEMPLATES).find(t => t.id === templateId) || B2B_TEMPLATES[templateId] || B2B_TEMPLATES.initial_contact;
  const message = renderB2BTemplate(template.text, { ...lead, tema_detectado });
  const sentAt = new Date().toISOString();
  lead.status = 'initial_contact_sent';
  lead.pipeline_stage = 'Contactado';
  lead.platform = platform || lead.platform;
  lead.detectedCategory = tema_detectado || lead.detectedCategory;
  lead.messages_sent = lead.messages_sent || [];
  lead.messages_sent.push({ templateId: template.id, sentAt, platform: lead.platform });
  lead.updatedAt = sentAt;
  saveLeadsDB(db);

  if (lead.platform === 'instagram') {
    const cmd = `node automatizacion-redes/ig-dm.mjs --user="${cleanUser}" --text="${message.replace(/"/g, '\\"')}"`;
    exec(cmd, (err, stdout) => {
      if (err) return res.json({ success: false, lead, message, error: err.message });
      res.json({ success: true, lead, message, log: stdout });
    });
    return;
  }

  if (lead.platform === 'threads') {
    const cmd = `node automatizacion-redes/threads-dm.mjs --user="${cleanUser}" --text="${message.replace(/"/g, '\\"')}"`;
    exec(cmd, (err, stdout) => {
      if (err) return res.json({ success: false, lead, message, error: err.message });
      res.json({ success: true, lead, message, log: stdout });
    });
    return;
  }

  // Plataforma no soportada — registrar y responder
  res.json({ success: true, lead, message, note: `Plataforma "${lead.platform}" no tiene automatizador dedicado; mensaje registrado en CRM.` });
});

// ==========================================
// 💬 SECCIÓN 8 — DM ENDPOINTS (Multi-plataforma: Instagram + Threads)
// ==========================================

app.post('/api/dm/send', async (req, res) => {
  const { username, pitch, platform } = req.body;
  if (!username || !pitch) return res.status(400).json({ error: 'Faltan parámetros' });

  const cleanUser = username.replace('@', '').trim();
  const targetPlatform = (platform || 'instagram').toLowerCase();
  console.log(`💬 [CRM OUTREACH] Enviando DM rápido a @${cleanUser} via ${targetPlatform}...`);

  try {
    let cmd;
    if (targetPlatform === 'threads') {
      cmd = `node automatizacion-redes/threads-dm.mjs --user="${cleanUser}" --text="${pitch.replace(/"/g, '\\\\"')}"`;
    } else {
      cmd = `node automatizacion-redes/ig-dm.mjs --user="${cleanUser}" --text="${pitch.replace(/"/g, '\\\\"')}"`;
    }

    exec(cmd, (err, stdout, stderr) => {
      const stats = readStatsDB();
      stats.dmsSent = (stats.dmsSent || 0) + 1;
      saveStatsDB(stats);

      // Registrar automáticamente lead si no existe en el pipeline
      const leadsDb = readLeadsDB();
      
      // Buscar primero en B2B leads
      let lead = (leadsDb.b2b_leads || []).find(l => 
        l.username.toLowerCase() === `@${cleanUser.toLowerCase()}` || 
        l.username.toLowerCase() === cleanUser.toLowerCase()
      );
      
      if (lead) {
        lead.status = "DM Enviado";
        lead.pipeline_stage = "DM Enviado";
        if (!Array.isArray(lead.messages_sent)) {
          lead.messages_sent = [];
        }
        lead.messages_sent.push({
          message: pitch,
          sentAt: new Date().toISOString()
        });
        lead.notes = (lead.notes || "") + `\nDM Pitch B2B (${targetPlatform}): "${pitch.substring(0, 40)}..."`;
        lead.updatedAt = new Date().toISOString();
      } else {
        // Si no es B2B, buscar en leads comunes
        lead = (leadsDb.leads || []).find(l => 
          l.username.toLowerCase() === `@${cleanUser.toLowerCase()}` || 
          l.username.toLowerCase() === cleanUser.toLowerCase()
        );
        if (!lead) {
          lead = {
            id: `lead_${Date.now()}`,
            username: `@${cleanUser}`,
            platform: targetPlatform === 'threads' ? 'Threads' : 'Instagram',
            source: "DM Pitch Rápido",
            status: "DM Enviado",
            notes: `Enviado pitch via ${targetPlatform}: "${pitch.substring(0, 40)}..."`,
            messages_sent: [{
              message: pitch,
              sentAt: new Date().toISOString()
            }],
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };
          leadsDb.leads.push(lead);
        } else {
          lead.status = "DM Enviado";
          if (!Array.isArray(lead.messages_sent)) {
            lead.messages_sent = [];
          }
          lead.messages_sent.push({
            message: pitch,
            sentAt: new Date().toISOString()
          });
          lead.notes += `\nDM Pitch (${targetPlatform}): "${pitch.substring(0, 40)}..."`;
          lead.updatedAt = new Date().toISOString();
        }
      }
      saveLeadsDB(leadsDb);
      
      if (err) {
        console.log(`❌ [DM ${targetPlatform}] Error: ${err.message}`);
        if (stderr) console.log(`   stderr: ${stderr}`);
        res.json({ success: false, error: err.message, platform: targetPlatform });
      } else {
        console.log(`✅ [DM ${targetPlatform}] Enviado a @${cleanUser}`);
        res.json({ success: true, log: stdout, platform: targetPlatform });
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/dm/monitor', (req, res) => {
  console.log(`🕵️‍♂️ [CRM OUTREACH] Iniciando vigilancia de Inbox por respuestas...`);
  const cmd = `node automatizacion-redes/dm-monitor.mjs`;
  
  exec(cmd, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
    if (err) {
      console.error("🕵️‍♂️ [DM MONITOR Error]", err.message);
      return res.json({ success: false, error: err.message, log: stdout, stderr });
    }
    console.log("🕵️‍♂️ [DM MONITOR] Monitoreo completado con éxito.");
    res.json({ success: true, log: stdout });
  });
});

// ==========================================
// ⚙️ SECCIÓN 9 — GENERATOR STATUS ENDPOINTS
// ==========================================

app.get('/api/generator/status', (req, res) => {
  const status = getGeneratorStatus();
  res.json({ success: true, ...status });
});

app.post('/api/generator/toggle', (req, res) => {
  try {
    let currentConfig = getIGConfig();
    const desired = req.body.enabled !== undefined ? !!req.body.enabled : !currentConfig.autoGeneratorEnabled;
    currentConfig.autoGeneratorEnabled = desired;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2), 'utf-8');
    console.log(`🎨 [GENERATOR TOGGLE] Auto-generador cambiado a: ${desired ? 'ACTIVADO' : 'DESACTIVADO'}`);
    res.json({ success: true, autoGeneratorEnabled: desired });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/generator/run', (req, res) => {
  console.log("🎨 [IA GEN MANUAL TRIGGER] Gatillando generación manual de imágenes del día...");
  generateDailyContent().catch(console.error);
  res.json({ success: true, message: "Generación asíncrona iniciada en segundo plano." });
});

// ==========================================
// 🔌 RETRO-COMPATIBILIDAD CON ENDPOINTS PM2 Y WEBHOOKS
// ==========================================

app.get('/vault', handleGetVault);
app.get('/marketing/vault', handleGetVault);

function handleGetVault(req, res) {
  const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');
  if (fs.existsSync(vaultPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      res.json({ success: true, vault: data });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  } else {
    res.json({ success: true, vault: [] });
  }
}

app.get('/pm2/status', async (req, res) => {
  try {
    const { stdout } = await execAsync('npx pm2 jlist');
    const data = JSON.parse(stdout);
    const services = data.map(proc => ({
      name: proc.name,
      status: proc.pm2_env.status,
      cpu: proc.monit ? proc.monit.cpu : 0,
      memory: proc.monit ? proc.monit.memory : 0,
      restarts: proc.pm2_env.restart_time
    }));
    res.json({ success: true, services });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/pm2/action', async (req, res) => {
  let { action, service } = req.body;
  
  // Mapear tradeshare-bridge a tradeshare-playwriter-daemon para compatibilidad con el switch de la UI
  if (service === 'tradeshare-bridge') {
    service = 'tradeshare-playwriter-daemon';
  }

  const allowed = [
    'tradeshare-daemon', 
    'tradeshare-n8n', 
    'tradeshare-bridge', 
    'tradeshare-local', 
    'tradeshare-scheduler', 
    'tradeshare-playwriter-daemon', 
    'tradeshare-playwriter-relay', 
    'tradeshare-threads-outreach',
    'tradeshare-threads-quotes',
    'tradeshare-facebook-groups',
    'tradeshare-dm-monitor'
  ];
  if (!['start', 'stop', 'restart'].includes(action) || !allowed.includes(service)) {
    return res.status(400).json({ error: 'Acción o servicio inválido' });
  }
  try {
    const { stdout } = await execAsync(`npx pm2 ${action} ${service}`);
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 🔌 NUEVOS ENDPOINTS DE AUTOMATIZACIÓN Y LOGS
// ==========================================

/**
 * Endpoint para agregar prospectos detectados por el vigilador de comentarios
 */
app.post('/prospects/add', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Falta username del prospecto." });

  try {
    const db = readLeadsDB();
    const cleanUser = username.startsWith('@') ? username : `@${username}`;
    
    let lead = db.leads.find(l => l.username.toLowerCase() === cleanUser.toLowerCase());
    if (!lead) {
      lead = {
        id: `lead_${Date.now()}`,
        username: cleanUser,
        platform: "Instagram",
        source: "Playwriter Daemon",
        status: "Detectado",
        notes: "Detectado automáticamente por el vigilador de comentarios.",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      db.leads.push(lead);
      saveLeadsDB(db);
      console.log(`📡 [AUTO-CRM] Nuevo prospecto detectado e inyectado: ${cleanUser}`);
    }
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint para actualizar las estadísticas de crecimiento de seguidores de Instagram
 */
app.post('/instagram-stats/update', (req, res) => {
  const { account, followers, following } = req.body;
  if (!account || followers === undefined) {
    return res.status(400).json({ error: "Faltan parámetros account o followers." });
  }

  try {
    const statsPath = path.join(PROJECT_ROOT, '.agent', 'instagram_stats.json');
    let igStats = {};
    if (fs.existsSync(statsPath)) {
      try { igStats = JSON.parse(fs.readFileSync(statsPath, 'utf-8')); } catch (e) {}
    }

    igStats[account] = igStats[account] || {};
    igStats[account].followers = Number(followers) || 0;
    igStats[account].following = Number(following) || 0;
    igStats[account].history = igStats[account].history || [];
    
    // Evitar duplicados de fecha en el historial
    const todayStr = new Date().toISOString().split('T')[0];
    const existsToday = igStats[account].history.some(h => h.date && h.date.startsWith(todayStr));
    if (!existsToday) {
      igStats[account].history.push({
        date: new Date().toISOString(),
        followers: Number(followers) || 0
      });
    }

    fs.writeFileSync(statsPath, JSON.stringify(igStats, null, 2), 'utf-8');

    // Sincronizar con el base central de stats-db.json si es la cuenta principal
    const stats = readStatsDB();
    if (account === 'tradeshare.ok' || account === 'braiurato') {
      stats.followersReal = Number(followers) || 0;
      stats.growthHistory = (igStats[account].history || []).map(h => ({
        date: h.date ? h.date.split('T')[0] : new Date().toLocaleDateString('es-AR'),
        value: h.followers
      }));
      saveStatsDB(stats);
      console.log(`📈 [STATS UPDATE] Cuenta @${account} actualizada: ${followers} seguidores.`);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint para obtener los logs en vivo del sistema
 */
app.get('/logs', (req, res) => {
  const { service } = req.query;
  
  const serviceLogMap = {
    'playwriter-daemon': { out: 'playwriter-daemon-out.log', err: 'playwriter-daemon-error.log', title: 'INSTAGRAM PLAYWRITER DAEMON' },
    'dm-monitor': { out: 'dm-monitor-out.log', err: 'dm-monitor-error.log', title: 'INSTAGRAM DM MONITOR (IA RESPONDER)' },
    'facebook-groups': { out: 'facebook-groups-out.log', err: 'facebook-groups-error.log', title: 'FACEBOOK GROUPS BOT' },
    'threads-quotes': { out: 'threads-quotes-out.log', err: 'threads-quotes-error.log', title: 'THREADS AUTO-PUBLISHER (QUOTES)' },
    'threads-outreach': { out: 'threads-outreach-out.log', err: 'threads-outreach-error.log', title: 'THREADS OUTREACH BOT' },
    'scheduler': { out: 'scheduler-out.log', err: 'scheduler-error.log', title: 'DAILY SCHEDULER' },
    'local': { out: 'local-out.log', err: 'local-error.log', title: 'TRADESHARE LOCAL SERVER' },
    'growth-os': { out: 'growth-os-out.log', err: 'growth-os-error.log', title: 'COCKPIT GROWTH OS SERVER' },
    'n8n': { out: 'n8n-out.log', err: 'n8n-error.log', title: 'N8N LOCAL SERVER' },
    'gemini-proxy': { out: 'gemini-proxy-out.log', err: 'gemini-proxy-error.log', title: 'GEMINI PROXY' }
  };

  let logs = [];

  try {
    if (service && serviceLogMap[service]) {
      const config = serviceLogMap[service];
      const outPath = path.join(PROJECT_ROOT, '.agent', config.out);
      const errPath = path.join(PROJECT_ROOT, '.agent', config.err);

      logs.push(`=== ${config.title} LOGS ===`);
      if (fs.existsSync(outPath)) {
        const data = fs.readFileSync(outPath, 'utf-8');
        const lines = data.split('\n').filter(Boolean).slice(-100);
        logs.push(...lines);
      } else {
        logs.push(`(No se encontró el archivo de log de salida: ${config.out})`);
      }

      if (fs.existsSync(errPath)) {
        const errData = fs.readFileSync(errPath, 'utf-8');
        const errLines = errData.split('\n').filter(Boolean).slice(-30);
        if (errLines.length > 0) {
          logs.push("", `=== ${config.title} RECENT ERRORS ===`);
          logs.push(...errLines);
        }
      }
    } else {
      // Retornar un resumen combinado
      logs.push("=== RESUMEN GLOBAL DE LOGS DE BOTS ===");
      for (const [key, config] of Object.entries(serviceLogMap)) {
        const outPath = path.join(PROJECT_ROOT, '.agent', config.out);
        if (fs.existsSync(outPath)) {
          const data = fs.readFileSync(outPath, 'utf-8');
          const lines = data.split('\n').filter(Boolean).slice(-12);
          if (lines.length > 0) {
            logs.push("", `[${config.title}]`);
            logs.push(...lines.map(line => `  ${line}`));
          }
        }
      }
    }
  } catch (e) {
    logs.push(`Error leyendo logs: ${e.message}`);
  }

  if (logs.length === 0) {
    logs.push("No hay logs disponibles todavía.");
  }

  res.json({ success: true, logs });
});

app.get('/api/ai/activity', (req, res) => {
  const activityPath = path.join(PROJECT_ROOT, '.agent', 'local-ai-activity.json');
  try {
    if (fs.existsSync(activityPath)) {
      const data = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
      return res.json({ success: true, activity: data });
    }
  } catch (e) {}
  res.json({ success: true, activity: [] });
});

// ==========================================
// ⚙️ SECCIÓN 9 — ENDPOINTS DE CONFIGURACIÓN E IA LOCAL
// ==========================================
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');

// Helper para leer configuración
function getIGConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Error leyendo ig-config.json:', e.message);
  }
  return {};
}

// Endpoint para obtener configuración
app.get('/api/config', (req, res) => {
  res.json({ success: true, config: getIGConfig() });
});

// Endpoint para guardar configuración
app.post('/api/config', (req, res) => {
  try {
    const newConfig = req.body;
    let currentConfig = {};
    if (fs.existsSync(CONFIG_PATH)) {
      currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
    
    // Fusionar la configuración nueva con la existente de forma segura
    const mergedConfig = {
      ...currentConfig,
      ...newConfig,
      prompts: {
        ...(currentConfig.prompts || {}),
        ...(newConfig.prompts || {})
      },
      account: {
        ...(currentConfig.account || {}),
        ...(newConfig.account || {})
      }
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), 'utf-8');
    console.log('⚙️ [CONFIG] Configuración ig-config.json actualizada desde el Dashboard.');
    res.json({ success: true, config: mergedConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para obtener modelos de Ollama locales instalados
app.get('/api/ai/models', (req, res) => {
  exec('ollama list', (err, stdout) => {
    if (err) {
      console.log('⚠️ Ollama no está respondiendo o no está instalado:', err.message);
      // Retornar lista básica por defecto si Ollama no responde
      return res.json({
        success: true,
        online: false,
        models: [
          { name: 'qwen2.5:7b', size: '4.7 GB', status: 'offline' },
          { name: 'llama3.2:3b', size: '2.0 GB', status: 'offline' }
        ]
      });
    }

    try {
      const lines = stdout.split('\n').filter(Boolean);
      const models = [];
      // Saltar la cabecera (NAME ID SIZE MODIFIED)
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 3) {
          const name = parts[0];
          let size = parts[2];
          if (parts[3] === 'GB' || parts[3] === 'MB') size += ' ' + parts[3];
          models.push({ name, size, status: 'online' });
        }
      }
      res.json({ success: true, online: true, models });
    } catch (parseErr) {
      res.json({ success: true, online: false, error: parseErr.message, models: [] });
    }
  });
});

// Endpoint para generar respuestas personalizadas a comentarios vía IA local/OpenClaw
app.post('/api/ai/generate-comment-reply', async (req, res) => {
  const { username, commentText } = req.body;
  if (!username || !commentText) {
    return res.status(400).json({ error: "Faltan parámetros username o commentText." });
  }

  try {
    const config = getIGConfig();
    const systemPersona = config.prompts?.system_persona || 'Eres el asistente de ventas de TradeShare...';
    const commentTemplate = config.prompts?.comment_keyword_reply || 'Un usuario llamado @{{USERNAME}} comentó: {{COMMENT_TEXT}}...';

    const renderedPrompt = commentTemplate
      .replace(/{{USERNAME}}/g, username)
      .replace(/{{COMMENT_TEXT}}/g, commentText);

    let activeModel = config.activeModel || 'ollama/qwen2.5:7b';
    if (!activeModel.startsWith('ollama/')) {
      activeModel = `ollama/${activeModel}`;
    }

    console.log(`🤖 [IA REPLIER] Generando respuesta a comentario para @${username} usando modelo ${activeModel}`);

    let reply = '';
    try {
      const response = await fetch('http://localhost:18789/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemPersona },
            { role: 'user', content: renderedPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`OpenClaw respondió con status ${response.status}`);
      }

      const data = await response.json();
      reply = data.choices[0].message.content.trim();
      logAIActivity('comment-reply', renderedPrompt, reply, activeModel);
    } catch (openClawErr) {
      console.warn(`⚠️ OpenClaw failed, trying direct Ollama fallback for comment reply: ${openClawErr.message}`);
      const cleanModel = activeModel.replace(/^ollama\//, '');
      const response = await fetch('http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          messages: [
            { role: 'system', content: systemPersona },
            { role: 'user', content: renderedPrompt }
          ],
          stream: false
        })
      });
      if (!response.ok) {
        throw new Error(`Both OpenClaw and Ollama failed.`);
      }
      const data = await response.json();
      reply = data.choices[0].message.content.trim();
      logAIActivity('comment-reply (fallback)', renderedPrompt, reply, cleanModel);
    }
    res.json({ success: true, reply });
  } catch (err) {
    console.error("❌ [IA REPLIER ERROR]", err.message);
    res.status(500).json({ success: false, error: err.message, fallback: "¡Excelente! Te escribimos por privado con todos los detalles. 🚀" });
  }
});

/**
 * Endpoint retrocompatible para envío de mensajes directos
 */
app.post('/send-dm', (req, res) => {
  console.log(`⚡ [LEGACY ROUTING] Redireccionando petición /send-dm a /api/dm/send`);
  req.body.pitch = req.body.message || req.body.pitch;
  req.url = '/api/dm/send';
  app.handle(req, res);
});

// ==========================================
// 🚀 INICIALIZACIÓN Y AUTO-TRIGGER
// ==========================================

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Social Growth OS TradeShare Server activo en: http://localhost:${PORT}`);

  if (process.env.SKIP_AUTO_GENERATION === '1') {
    console.log('🎨 [AUTO-TRIGGER] Saltado por SKIP_AUTO_GENERATION=1.');
    return;
  }

  // Verificar si el generador autónomo está habilitado en la configuración
  try {
    const config = getIGConfig();
    if (config.autoGeneratorEnabled !== true) {
      console.log('🎨 [AUTO-TRIGGER] Auto-generador de imágenes DESHABILITADO en ig-config.json. No se abren pestañas.');
      return;
    }

    const db = readPostsDB();
    const todayStr = new Date().toISOString().split('T')[0];
    const generatedToday = db.posts.some(p => p.source === 'auto-generated' && p.createdAt && p.createdAt.startsWith(todayStr));
    
    if (!generatedToday) {
      console.log('🎨 [AUTO-TRIGGER] Auto-generador habilitado. No se detectó contenido generado hoy. Iniciando generateDailyContent() asíncronamente...');
      generateDailyContent().catch(console.error);
    } else {
      console.log('🎨 [AUTO-TRIGGER] Contenido de hoy ya generado previamente. Saltando trigger.');
    }
  } catch (e) {
    console.error('Error al realizar auto-trigger de generación diaria:', e.message);
  }
});
