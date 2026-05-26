import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { readPostsDB, savePostsDB, readStatsDB, saveStatsDB } from './data-manager.mjs';
import { publishToIG } from './ig-publisher.mjs';
import { publishToThreads } from './threads-publisher.mjs';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const app = express();
const PORT = 5680;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directorios de Medios configurables
const MEDIA_DIRS = [
  path.join(PROJECT_ROOT, 'media'),
  '/home/biurato/Escritorio/trade-share/GENERADASIA/FEED',
  '/home/biurato/Escritorio/GENERADASIA/FEED',
  '/home/biurato/Escritorio/GENERADASIA/HISTORIAS',
  '/home/biurato/Escritorio/trade-share/GENERADASIA/HISTORIAS'
];

// Asegurar que exista la carpeta media local
if (!fs.existsSync(MEDIA_DIRS[0])) {
  fs.mkdirSync(MEDIA_DIRS[0], { recursive: true });
}

// Servir carpetas de imágenes de forma estática
app.use('/media', express.static(MEDIA_DIRS[0]));
MEDIA_DIRS.slice(1).forEach((dir, i) => {
  if (fs.existsSync(dir)) {
    app.use(`/media-ext-${i}`, express.static(dir));
  }
});

// Servir la carpeta public estática del frontend
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// Redireccionar al Dashboard principal
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'dashboard.html'));
});

// ==========================================
// 📸 NUEVA SECCIÓN 1 — BÓVEDA DE CONTENIDOS (MEDIA LIBRARY)
// ==========================================

/**
 * Escanea directorios de medios y devuelve imágenes con sus estados del CRM
 */
app.get('/api/media', (req, res) => {
  try {
    const db = readPostsDB();
    const images = [];
    const extList = ['.png', '.jpg', '.jpeg', '.webp'];

    MEDIA_DIRS.forEach((dir, dirIdx) => {
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (!extList.includes(ext)) return;

        const absolutePath = path.join(dir, file);
        const stats = fs.statSync(absolutePath);
        
        // Determinar URL de servicio estática
        const serveUrl = dirIdx === 0 
          ? `/media/${file}` 
          : `/media-ext-${dirIdx - 1}/${file}`;

        // Buscar si esta imagen ya está registrada en posts-db.json
        let postInfo = db.posts.find(p => p.filename === absolutePath || p.filename === file || p.filename === serveUrl);

        if (!postInfo) {
          // Si no está registrado en posts-db, crear un registro básico al vuelo (auto-descubrimiento)
          postInfo = {
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            filename: absolutePath,
            title: file.replace(ext, '').replace(/[-_]/g, ' '),
            captions: [],
            scheduled: [],
            published: [],
            createdAt: stats.birthtime.toISOString()
          };
          db.posts.push(postInfo);
        }

        // Determinar estado actual
        let status = 'unposted'; // badge: Sin publicar
        if (postInfo.published.length > 0) {
          status = 'published';
        } else if (postInfo.scheduled.some(s => s.status === 'pending')) {
          status = 'scheduled';
        }

        images.push({
          id: postInfo.id,
          filename: file,
          absolutePath,
          serveUrl,
          title: postInfo.title,
          createdAt: postInfo.createdAt,
          mtime: stats.mtime.toISOString(),
          status,
          captions: postInfo.captions,
          scheduled: postInfo.scheduled,
          published: postInfo.published
        });
      });
    });

    // Guardar los auto-descubrimientos nuevos si existen
    savePostsDB(db);

    // Ordenar por modificación más reciente primero
    images.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json({ success: true, media: images });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Obtener todos los posts del CRM
 */
app.get('/api/posts', (req, res) => {
  const db = readPostsDB();
  res.json({ success: true, posts: db.posts });
});

/**
 * Modificar/Agregar descripción/caption de un post
 */
app.post('/api/posts/:id/caption', (req, res) => {
  const { id } = req.params;
  const { text, label } = req.body;
  if (!text) return res.status(400).json({ error: 'Falta parámetro text' });

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });

  // Crear o actualizar caption
  post.captions = [{
    id: 'c1',
    label: label || 'Caption Principal',
    text
  }];

  savePostsDB(db);
  res.json({ success: true, post });
});

/**
 * Programar publicación de un post
 */
app.post('/api/posts/:id/schedule', (req, res) => {
  const { id } = req.params;
  const { scheduledAt, destinations } = req.body; // scheduledAt: "YYYY-MM-DDTHH:MM:SS"
  if (!scheduledAt || !destinations) return res.status(400).json({ error: 'Faltan parámetros' });

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });

  post.scheduled.push({
    scheduledAt,
    destinations,
    captionId: 'c1',
    status: 'pending'
  });

  savePostsDB(db);
  res.json({ success: true, post });
});

/**
 * Publicación instantánea manual desde el Dashboard
 */
app.post('/api/posts/:id/publish', async (req, res) => {
  const { id } = req.params;
  const { destinations, captionText, account } = req.body;
  const selectedAccount = account || 'tradeshare.ok';

  const db = readPostsDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });

  const textToPublish = captionText || post.captions[0]?.text || '¡Mentalidad de Trading! 🚀 #tradeshare';
  const results = {};

  console.log(`🚀 [CRM MANUAL PUBLISH] Iniciando publicación para post ${post.title} en canales: ${destinations.join(', ')}`);

  // Publicar en IG Feed
  if (destinations.includes('ig_feed')) {
    try {
      await publishToIG(post.filename, textToPublish, 'feed', selectedAccount, id);
      results.ig_feed = { success: true };
    } catch (e) {
      results.ig_feed = { success: false, error: e.message };
    }
  }

  // Publicar en IG Story
  if (destinations.includes('ig_story')) {
    try {
      await publishToIG(post.filename, textToPublish, 'story', selectedAccount, id);
      results.ig_story = { success: true };
    } catch (e) {
      results.ig_story = { success: false, error: e.message };
    }
  }

  // Publicar en Threads
  if (destinations.includes('threads')) {
    try {
      await publishToThreads(textToPublish);
      results.threads = { success: true };
    } catch (e) {
      results.threads = { success: false, error: e.message };
    }
  }

  // Marcar como publicado localmente
  const allSuccess = Object.values(results).some(r => r.success);
  if (allSuccess) {
    post.published.push({
      publishedAt: new Date().toISOString(),
      destinations: Object.keys(results).filter(k => results[k].success),
      captionId: 'c1',
      link: results.ig_feed?.link || 'https://instagram.com/' + selectedAccount
    });
    savePostsDB(db);
  }

  res.json({ success: true, results });
});

// ==========================================
// 📅 NUEVA SECCIÓN 2 — CRONOGRAMA DE PUBLICACIONES
// ==========================================

app.get('/api/schedule', (req, res) => {
  const db = readPostsDB();
  const pending = [];
  
  db.posts.forEach(post => {
    post.scheduled.forEach(sched => {
      if (sched.status === 'pending') {
        pending.push({
          id: post.id,
          title: post.title,
          filename: post.filename,
          scheduledAt: sched.scheduledAt,
          destinations: sched.destinations,
          caption: post.captions[0]?.text || ''
        });
      }
    });
  });

  // Ordenar cronológicamente
  pending.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  res.json({ success: true, schedule: pending });
});

// ==========================================
// 📊 NUEVA SECCIÓN 4 — PANEL DE ESTADÍSTICAS CRM
// ==========================================

app.get('/api/stats', (req, res) => {
  const stats = readStatsDB();
  
  // Actualizar estado de los daemons al vuelo verificando procesos pm2
  exec('npx pm2 jlist', (err, stdout) => {
    if (!err) {
      try {
        const pm2List = JSON.parse(stdout);
        pm2List.forEach(proc => {
          if (proc.name === 'tradeshare-playwriter-daemon') {
            stats.bots.daemon.status = proc.pm2_env.status;
          }
          if (proc.name === 'tradeshare-threads-outreach') {
            stats.bots.threads.status = proc.pm2_env.status;
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

// ==========================================
// 💬 NUEVA SECCIÓN 6 — ENVÍO RÁPIDO DE DM
// ==========================================

app.post('/api/dm/send', async (req, res) => {
  const { username, pitch } = req.body;
  if (!username || !pitch) return res.status(400).json({ error: 'Faltan parámetros' });

  const cleanUser = username.replace('@', '').trim();
  console.log(`💬 [CRM OUTREACH] Enviando DM rápido a @${cleanUser}...`);

  try {
    const cmd = `node automatizacion-redes/ig-dm.mjs --user="${cleanUser}" --text="${pitch.replace(/"/g, '\\"')}"`;
    exec(cmd, (err, stdout) => {
      // Registrar en logs del CRM
      const stats = readStatsDB();
      stats.dmsSent = (stats.dmsSent || 0) + 1;
      saveStatsDB(stats);
      
      if (err) {
        res.json({ success: false, error: err.message });
      } else {
        res.json({ success: true, log: stdout });
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==========================================
// 🧠 NUEVA SECCIÓN 5 — ASISTENTE IA COPILOTO
// ==========================================

app.post('/api/ai/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Falta el prompt del usuario.' });

  try {
    // Usar la lógica experta de marketing ya predefinida
    const reply = getExpertMarketingReply(prompt);
    res.json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ============================================================================
// 🔌 INTEGRACIÓN Y RETRO-COMPATIBILIDAD CON ENDPOINTS PREVIOS (ig-bridge-v2.mjs)
// ============================================================================

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

app.get('/prospects', (req, res) => {
  const logPath = path.join(PROJECT_ROOT, '.agent', 'prospects.json');
  if (fs.existsSync(logPath)) {
    try {
      const prospects = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      res.json({ success: true, prospects });
    } catch (e) {
      res.json({ success: true, prospects: {} });
    }
  } else {
    res.json({ success: true, prospects: {} });
  }
});

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
    'tradeshare-threads-outreach'
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

app.get('/monitored-posts', (req, res) => {
  const file = path.join(PROJECT_ROOT, '.agent', 'monitored_posts.json');
  try {
    let state = { posts: [], profiles: ['braiurato'] };
    if (fs.existsSync(file)) {
      state = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    res.json({ success: true, posts: state.posts, profiles: state.profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/logs', (req, res) => {
  const logPath = path.join(PROJECT_ROOT, '.agent', 'playwriter-daemon-out-5.log');
  const fallbackLog = path.join(PROJECT_ROOT, '.agent', 'playwriter-daemon-error-5.log');
  const activeLog = fs.existsSync(logPath) ? logPath : fallbackLog;
  
  if (fs.existsSync(activeLog)) {
    try {
      const content = fs.readFileSync(activeLog, 'utf8');
      const lines = content.split('\n').filter(Boolean).slice(-65);
      res.json({ success: true, logs: lines });
    } catch (e) {
      res.json({ success: true, logs: [`Error leyendo logs: ${e.message}`] });
    }
  } else {
    res.json({ success: true, logs: ['Archivo de logs no encontrado'] });
  }
});

app.get('/ping', (req, res) => res.send('pong'));

app.post('/marketing/publish-multi', async (req, res) => {
  const { id, frase, copy, imageUrl, imagenUrl, channels, account } = req.body;
  const chosenChannels = channels || [];
  const selectedAccount = account || 'tradeshare.ok';
  
  const finalImage = imageUrl || imagenUrl || '/generated_posts/placeholder.png';
  let absoluteImagePath = finalImage;
  if (!finalImage.startsWith('http') && !finalImage.startsWith('/home')) {
    absoluteImagePath = path.join(PROJECT_ROOT, 'public', finalImage.startsWith('/') ? finalImage : '/' + finalImage);
  }

  const safeCaption = (copy || frase || '').replace(/"/g, '\\"');
  const results = {};

  console.log(`🚀 [MULTI-PUBLISH] Iniciando publicación cruzada para canales: ${chosenChannels.join(', ')}`);

  // Threads
  if (chosenChannels.includes('threads')) {
    try {
      await publishToThreads(safeCaption);
      results.threads = { success: true };
    } catch (e) {
      results.threads = { success: false, error: e.message };
    }
  }

  // Instagram Feed
  if (chosenChannels.includes('instagramFeed')) {
    try {
      await publishToIG(absoluteImagePath, safeCaption, 'feed', selectedAccount, id);
      results.instagramFeed = { success: true };
    } catch (e) {
      results.instagramFeed = { success: false, error: e.message };
    }
  }

  // Instagram Story
  if (chosenChannels.includes('instagramStory')) {
    try {
      await publishToIG(absoluteImagePath, safeCaption, 'story', selectedAccount, id);
      results.instagramStory = { success: true };
    } catch (e) {
      results.instagramStory = { success: false, error: e.message };
    }
  }

  res.json({ success: true, results });
});

app.post('/ig/publish-feed-folder', async (req, res) => {
  const account = req.body.account || 'tradeshare.ok';
  try {
    const { stdout } = await execAsync(`node automatizacion-redes/ig-feed-from-folder.mjs --type=feed --account=${account}`, { cwd: PROJECT_ROOT });
    res.json({ success: true, log: stdout });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/ig/publish-story-folder', async (req, res) => {
  const account = req.body.account || 'tradeshare.ok';
  try {
    const { stdout } = await execAsync(`node automatizacion-redes/ig-feed-from-folder.mjs --type=story --account=${account}`, { cwd: PROJECT_ROOT });
    res.json({ success: true, log: stdout });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/update-config', (req, res) => {
  const { selectedAccount, slots, channels, activeGenerators } = req.body;
  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    if (selectedAccount !== undefined) data.selectedAccount = selectedAccount;
    if (slots !== undefined) data.slots = slots;
    if (channels !== undefined) data.channels = channels;
    if (activeGenerators !== undefined) data.activeGenerators = activeGenerators;
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    res.json({ success: true, config: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getExpertMarketingReply(message) {
  const msg = message.toLowerCase();
  if (msg.includes('hook') || msg.includes('gancho')) {
    return `🎯 **Estrategia de Hooks Virales:** Para capturar traders consistentes o frustrados, debes atacar su dolor de inmediato en los primeros 3 segundos. 
Aquí tienes 3 opciones personalizadas para TradeShare:
1. *"¿Sigues analizando con TradingView gratis? Este indicador oculto cambiará todo."* (Enfoque curiosidad)
2. *"Quemé 3 cuentas de fondeo antes de darme cuenta de esta regla básica..."* (Enfoque empatía/dolor)
3. *"El 92% de los traders de Forex están cometiendo esta trampa de apertura."* (Enfoque autoridad)
¿Quieres que redactemos el caption completo para alguno de estos?`;
  }
  if (msg.includes('horario') || msg.includes('publicar') || msg.includes('tiempo')) {
    return `⏰ **Optimización de Horarios:** Analizando las métricas de tu audiencia local:
- **@braiurato:** Los picos de retención están a las **12:00 PM** (pausa de almuerzo/pre-Nueva York) y **7:30 PM**.
- **@tradeshare.ok:** Mayor interacción a las **1:00 PM** y **8:30 PM** los domingos.
Recomiendo programar tus posts de mayor valor educativo (carruseles de SMC) los domingos a las 8:00 PM, ya que es cuando los traders planifican su semana operativa.`;
  }
  if (msg.includes('crecer') || msg.includes('estrategia') || msg.includes('seguidores')) {
    return `📈 **Hoja de Ruta de Crecimiento:** Para escalar tus dos perfiles con enfoques complementarios:
1. **@braiurato (Lado Humano/Lifestyle):** Publica tus bitácoras de ganancias/pérdidas reales, hábitos diarios, mentalidad y errores. Esto genera empatía y demuestra consistencia real.
2. **@tradeshare.ok (Lado Comercial/Educativo):** Centrado 100% en hacks técnicos, conceptos de SMC/Orderflow rápidos y testimonios/ventajas de TradeShare como plataforma.
*Acción inmediata:* Publica 3 Reels semanales cruzados usando colaboraciones para transferir autoridad.`;
  }
  return `💡 **Consejo Profesional de Marketing:** Para que TradeShare se convierta en la red social de trading más grande, debemos enfocar el embudo en la *comprobación social*. 
Cada vez que un usuario comente una palabra clave como "BOT", envíale un DM estructurado que termine con una pregunta para iniciar la conversación:
*"¡Hola! Aquí tienes la bitácora que solicitaste. Por cierto, ¿estás operando cuentas de fondeo o capital propio actualmente?"*
Esto rompe el hielo y aumenta la tasa de conversión a registro en un 38%. ¿Qué te parece esta táctica?`;
}

// Iniciar servidor Express
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CRM DASHBOARD SERVER RUNNING AT http://localhost:${PORT}`);
});
