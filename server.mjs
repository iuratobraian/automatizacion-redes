import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { 
  readPostsDB, savePostsDB, 
  readStatsDB, saveStatsDB, 
  readLeadsDB, saveLeadsDB, 
  readPromptsDB, savePromptsDB 
} from './data-manager.mjs';
import { publishToIG } from './ig-publisher.mjs';
import { publishToThreads } from './threads-publisher.mjs';
import { generateTradingPrompt } from './prompt-engine.mjs';
import { generateDailyContent, getGeneratorStatus } from './content-auto-generator.mjs';
import { promptLibrary, getCaptionForPrompt } from './prompt-library.js';
import { B2B_TEMPLATES } from './outreach-templates.mjs';

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

// Asegurar directorios de medios
if (!fs.existsSync(MEDIA_DIR_FEED)) fs.mkdirSync(MEDIA_DIR_FEED, { recursive: true });
if (!fs.existsSync(MEDIA_DIR_HISTORIAS)) fs.mkdirSync(MEDIA_DIR_HISTORIAS, { recursive: true });

// Servir la carpeta public estática del frontend
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// Redireccionar al Dashboard principal
app.get('/', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
});

// ==========================================
// 📸 SECCIÓN 1 — MEDIA ENDPOINTS
// ==========================================

/**
 * Lista todos los archivos de ./public/images/feed y ./public/images/historias con metadata del CRM
 */
app.get('/api/media', (req, res) => {
  try {
    const db = readPostsDB();
    const mediaList = [];
    const extList = ['.png', '.jpg', '.jpeg', '.webp'];

    // Escanear feed/
    if (fs.existsSync(MEDIA_DIR_FEED)) {
      const files = fs.readdirSync(MEDIA_DIR_FEED);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (!extList.includes(ext)) return;

        const absPath = path.join(MEDIA_DIR_FEED, file);
        const stats = fs.statSync(absPath);
        const serveUrl = `/images/feed/${file}`;

        let postInfo = db.posts.find(p => 
          p.filename === file || 
          p.filename === serveUrl || 
          p.filepath === `./public/images/feed/${file}` ||
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
            filepath: `./public/images/feed/${file}`,
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

    // Escanear historias/
    if (fs.existsSync(MEDIA_DIR_HISTORIAS)) {
      const files = fs.readdirSync(MEDIA_DIR_HISTORIAS);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (!extList.includes(ext)) return;

        const absPath = path.join(MEDIA_DIR_HISTORIAS, file);
        const stats = fs.statSync(absPath);
        const serveUrl = `/images/historias/${file}`;

        let postInfo = db.posts.find(p => 
          p.filename === file || 
          p.filename === serveUrl || 
          p.filepath === `./public/images/historias/${file}` ||
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
            filepath: `./public/images/historias/${file}`,
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
  
  // Imagen absoluta para Playwright
  let absoluteImagePath = post.filepath;
  if (!absoluteImagePath.startsWith('/home') && !absoluteImagePath.startsWith('http')) {
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
      await publishToThreads(textToPublish);
      results.threads = { success: true };
    } catch (e) {
      results.threads = { success: false, error: e.message };
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
// 🧠 SECCIÓN 5 — IA ENDPOINTS
// ==========================================

app.post('/api/ai/generate-caption', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Falta prompt para generar caption." });

  const reply = getExpertMarketingReply(prompt);
  res.json({ success: true, caption: reply });
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
  
  // Consultar PM2 en caliente
  exec('npx pm2 jlist', (err, stdout) => {
    if (!err) {
      try {
        const pm2List = JSON.parse(stdout);
        pm2List.forEach(proc => {
          if (proc.name === 'tradeshare-bridge') {
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
        });
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
  res.json({ success: true, leads: db.leads });
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
      let lead = leadsDb.leads.find(l => l.username.toLowerCase() === `@${cleanUser.toLowerCase()}`);
      if (!lead) {
        lead = {
          id: `lead_${Date.now()}`,
          username: `@${cleanUser}`,
          platform: targetPlatform === 'threads' ? 'Threads' : 'Instagram',
          source: "DM Pitch Rápido",
          status: "DM Enviado",
          notes: `Enviado pitch via ${targetPlatform}: "${pitch.substring(0, 40)}..."`,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        leadsDb.leads.push(lead);
      } else {
        lead.status = "DM Enviado";
        lead.notes += `\nDM Pitch (${targetPlatform}): "${pitch.substring(0, 40)}..."`;
        lead.updatedAt = new Date().toISOString();
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

// ==========================================
// ⚙️ SECCIÓN 9 — GENERATOR STATUS ENDPOINTS
// ==========================================

app.get('/api/generator/status', (req, res) => {
  const status = getGeneratorStatus();
  res.json({ success: true, ...status });
});

app.post('/api/generator/run', (req, res) => {
  console.log("🎨 [IA GEN MANUAL TRIGGER] Gatillando generación manual de 15 imágenes del día...");
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
  const { action, service } = req.body;
  const allowed = [
    'tradeshare-daemon', 
    'tradeshare-n8n', 
    'tradeshare-bridge', 
    'tradeshare-local', 
    'tradeshare-scheduler', 
    'tradeshare-playwriter-daemon', 
    'tradeshare-playwriter-relay', 
    'tradeshare-threads-outreach',
    'tradeshare-threads-quotes'
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
  const daemonLogPath = path.join(PROJECT_ROOT, '.agent', 'playwriter_log.txt');
  const bridgeLogPath = path.join(PROJECT_ROOT, '.agent', 'growth-os-out.log');
  
  let logs = [];
  try {
    if (fs.existsSync(daemonLogPath)) {
      const data = fs.readFileSync(daemonLogPath, 'utf-8');
      const lines = data.split('\n').filter(Boolean).slice(-40);
      logs.push("=== PLAYWRITER DAEMON LOGS ===");
      logs.push(...lines);
    }
    if (fs.existsSync(bridgeLogPath)) {
      const data = fs.readFileSync(bridgeLogPath, 'utf-8');
      const lines = data.split('\n').filter(Boolean).slice(-30);
      logs.push("=== COCKPIT SERVER LOGS ===");
      logs.push(...lines);
    }
  } catch (e) {
    logs.push(`Error leyendo logs: ${e.message}`);
  }
  
  if (logs.length === 0) {
    logs.push("No hay logs disponibles todavía.");
  }
  
  res.json({ success: true, logs });
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


// Helper de respuestas de marketing
function getExpertMarketingReply(message) {
  const msg = message.toLowerCase();
  if (msg.includes('hook') || msg.includes('gancho')) {
    return `🎯 **Hooks Virales Generados:**\n1. "El 95% de los traders quema su cuenta por esto..."\n2. "¿Haces backtesting en Excel? Estás perdiendo el tiempo."\n3. "SMC básico vs SMC de élite: la gran trampa."`;
  }
  return `⚡ **Caption Generado por IA:**\n\nEl éxito en el trading se basa en una sola métrica: la consistencia matemática.\n\n🛡️ Si arriesgas más de lo que debes, no eres un trader, eres un jugador de casino.\n\nOperar con reglas duras y una bitácora real te dará la libertad que buscas. Registrate gratis en trade-share.com y escala tu trading. 🚀\n\n#trading #tradeshare #forex #psicotrading`;
}

// ==========================================
// 🚀 INICIALIZACIÓN Y AUTO-TRIGGER
// ==========================================

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Social Growth OS TradeShare Server activo en: http://localhost:${PORT}`);

  if (process.env.SKIP_AUTO_GENERATION === '1') {
    console.log('🎨 [AUTO-TRIGGER] Saltado por SKIP_AUTO_GENERATION=1.');
    return;
  }

  // Verificar si hoy ya se generó contenido del día
  try {
    const db = readPostsDB();
    const todayStr = new Date().toISOString().split('T')[0];
    const generatedToday = db.posts.some(p => p.source === 'auto-generated' && p.createdAt && p.createdAt.startsWith(todayStr));
    
    if (!generatedToday) {
      console.log('🎨 [AUTO-TRIGGER] No se detectó contenido generado hoy. Iniciando generateDailyContent() asíncronamente...');
      generateDailyContent().catch(console.error);
    } else {
      console.log('🎨 [AUTO-TRIGGER] Contenido de hoy ya generado previamente. Saltando trigger.');
    }
  } catch (e) {
    console.error('Error al realizar auto-trigger de generación diaria:', e.message);
  }
});
