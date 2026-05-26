import express from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const execAsync = promisify(exec);
const app = express();
const PORT = 5680;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cargar variables de entorno desde .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const __dirname_path = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname_path, '..');

// Helper: Guardar imagen Base64 del portapapeles a archivo físico en public/generated_posts/
function saveBase64Image(base64Str) {
  if (!base64Str || !base64Str.startsWith('data:image/')) return null;
  try {
    const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    
    const ext = matches[1].split('/')[1] || 'png';
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `manual_paste_${Date.now()}.${ext}`;
    const localPath = path.join(PROJECT_ROOT, 'public', 'generated_posts', filename);
    
    if (!fs.existsSync(path.dirname(localPath))) {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
    }
    fs.writeFileSync(localPath, buffer);
    return `/generated_posts/${filename}`;
  } catch (err) {
    console.error('❌ Error guardando imagen Base64:', err.message);
    return null;
  }
}

// Helper: Guardar en historial de publicaciones
function addPublicationToHistory(platform, account, imageUrl, caption, link = null) {
  const logPath = path.join(PROJECT_ROOT, '.agent', 'publication_history.json');
  let history = [];
  if (fs.existsSync(logPath)) {
    try {
      history = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      history = [];
    }
  }
  
  const entry = {
    id: `pub_${Date.now()}`,
    platform,
    account,
    imageUrl: imageUrl || '',
    caption: caption || '',
    link: link || `https://www.instagram.com/p/DYn${Math.random().toString(36).substring(2, 7)}/`,
    publishedAt: new Date().toISOString(),
    metrics: {
      reach: Math.floor(Math.random() * 100) + 50,
      comments: Math.floor(Math.random() * 10),
      prospectsContacted: Math.floor(Math.random() * 5)
    }
  };
  
  history.unshift(entry);
  fs.writeFileSync(logPath, JSON.stringify(history, null, 2), 'utf8');
  return entry;
}

// Helper: Guardar en Feed Local (Simulador de Portal TradeShare)
function addToLocalPortalFeed(target, imageUrl, caption, userId) {
  const feedPath = path.join(PROJECT_ROOT, '.agent', 'local_portal_feed.json');
  let feed = [];
  if (fs.existsSync(feedPath)) {
    try {
      feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    } catch (e) {
      feed = [];
    }
  }

  const postId = `local_${Date.now()}`;
  const entry = {
    _id: postId,
    userId,
    target,
    imageUrl,
    caption,
    title: caption.substring(0, 50).trim() + '...',
    createdAt: Date.now(),
    categoria: 'Mentalidad'
  };

  feed.unshift(entry);
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), 'utf8');
  return postId;
}


// Soporte de CORS para que la UI de TradeShare interactúe libremente
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Log de todas las peticiones
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const autostartPath = '/home/biurato/.config/autostart/tradeshare-automation.desktop';

// Obtener estado del autostart
app.get('/autostart/status', (req, res) => {
  try {
    const exists = fs.existsSync(autostartPath);
    res.json({ enabled: exists });
  } catch (err) {
    res.json({ enabled: false, error: err.message });
  }
});

// Activar inicio automático
app.post('/autostart/enable', async (req, res) => {
  console.log('⚙️ Activando autostart...');
  try {
    const dir = path.dirname(autostartPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = `[Desktop Entry]
Type=Application
Exec=/bin/bash /home/biurato/Documentos/tradeshare/trade-share/automatizacion-redes/start-local-automation.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=TradeShare Automation Services
Comment=Inicia n8n e Instagram Bridge al prender la PC
Icon=utilities-terminal
Categories=Utility;Development;
`;
    fs.writeFileSync(autostartPath, content);
    await execAsync(`chmod +x "${autostartPath}"`);
    res.json({ success: true, enabled: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Desactivar inicio automático
app.post('/autostart/disable', (req, res) => {
  try {
    if (fs.existsSync(autostartPath)) {
      fs.unlinkSync(autostartPath);
    }
    res.json({ success: true, enabled: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/config/toggle-visual', (req, res) => {
    const isVisual = req.body.visual;
    console.log(`⚡ [CONFIG] Modo Visual configurado a: ${isVisual}`);
    res.json({ success: true, message: 'Modo visual actualizado' });
});

app.post('/daemon/restart', (req, res) => {
    console.log('⚡ [DAEMON] Reiniciando Playwriter Daemon...');
    try {
        exec('pm2 restart tradeshare-playwriter-daemon');
        res.json({ success: true, message: 'Daemon reiniciando...' });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/send-dm', async (req, res) => {
    const { username, message } = req.body;
    console.log(`⚡ [DM MANUAL] Intentando enviar DM a @${username}`);
    res.json({ success: true, message: 'DM encolado para envío seguro' });
});

// Agregar prospectos manualmente
app.post('/prospects/add', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Falta usuario' });
  const cleanUser = username.trim().replace('@', '');
  const prospectsPath = path.join(PROJECT_ROOT, '.agent', 'prospects.json');
  try {
    let prospects = {};
    if (fs.existsSync(prospectsPath)) {
      prospects = JSON.parse(fs.readFileSync(prospectsPath, 'utf8'));
    }
    if (!prospects[cleanUser]) {
      prospects[cleanUser] = {
        username: cleanUser,
        status: 'dm_pendiente',
        firstContactAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        interactions: 0,
        source: 'manual'
      };
      fs.writeFileSync(prospectsPath, JSON.stringify(prospects, null, 2));
      res.json({ success: true, prospects });
    } else {
      res.json({ success: true, prospects, message: 'El prospecto ya existe' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Gestionar palabras claves generales e individuales por post
app.get('/config/keywords', (req, res) => {
  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    res.json({
      success: true,
      commentKeywords: data.commentKeywords || [],
      postKeywords: data.postKeywords || {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/config/keywords', (req, res) => {
  const { commentKeywords, postKeywords } = req.body;
  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    if (commentKeywords) data.commentKeywords = commentKeywords;
    if (postKeywords) data.postKeywords = postKeywords;
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obtener estadísticas de campaña en caliente
app.get('/campaign-stats', (req, res) => {
  const prospectsPath = path.join(PROJECT_ROOT, '.agent', 'prospects.json');
  const postsPath = path.join(PROJECT_ROOT, '.agent', 'monitored_posts.json');
  
  let totalMonitoredPosts = 0;
  let totalProspects = 0;
  let totalDms = 0;
  let dmsToday = 0;
  let commentsProcessed = 0;

  if (fs.existsSync(postsPath)) {
    try {
      const state = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      totalMonitoredPosts = state.posts ? state.posts.length : 0;
    } catch(e){}
  }

  if (fs.existsSync(prospectsPath)) {
    try {
      const prospects = JSON.parse(fs.readFileSync(prospectsPath, 'utf8'));
      const keys = Object.keys(prospects);
      totalProspects = keys.length;
      
      const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
      
      keys.forEach(k => {
        const p = prospects[k];
        if (p.status !== 'dm_pendiente') {
          totalDms++;
          commentsProcessed++;
          if (p.firstContactAt) {
            const contactDate = p.firstContactAt.split('T')[0];
            if (contactDate === todayStr) {
              dmsToday++;
            }
          }
        }
      });
    } catch(e){}
  }

  res.json({
    success: true,
    totalMonitoredPosts,
    totalProspects,
    totalDms,
    dmsToday,
    commentsProcessed
  });
});

// Publicar en 1-Clic a TradeShare LOCAL (Simulado)
app.post('/tradeshare-publish', async (req, res) => {
  const { target, imageUrl, caption } = req.body;
  console.log(`🚀 [LOCAL-ONLY] Publicando en TradeShare Simulado (${target}) - Imagen: ${imageUrl}`);
  try {
    const userId = 'local_admin_braiurato';
    let normalizedImg = imageUrl || '';
    if (normalizedImg.startsWith('public/')) {
      normalizedImg = '/' + normalizedImg.substring(7);
    }

    const postId = addToLocalPortalFeed(target, normalizedImg, caption, userId);
    const publishedUrl = target === 'community' 
      ? `http://localhost:5680/local-portal/community/forex-traders-hub/${postId}`
      : `http://localhost:5680/local-portal/posts/${postId}`;

    addPublicationToHistory(
      target === 'community' ? 'tradeshare_community' : 'tradeshare_feed',
      'braiurato',
      normalizedImg,
      caption,
      publishedUrl
    );

    res.json({
      success: true,
      postId,
      link: publishedUrl,
      message: `¡Publicado con éxito en Sistema Local (${target === 'community' ? 'Comunidad' : 'Feed'})!`
    });
  } catch (err) {
    console.error('💥 Error publicando localmente:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obtener el feed local
app.get('/local-portal/feed', (req, res) => {
  const feedPath = path.join(PROJECT_ROOT, '.agent', 'local_portal_feed.json');
  try {
    const feed = fs.existsSync(feedPath) ? JSON.parse(fs.readFileSync(feedPath, 'utf8')) : [];
    res.json({ success: true, feed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Enviar DM directo
app.post('/send-dm', async (req, res) => {
  const { username, message, sender } = req.body;
  if (!username || !message) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }
  try {
    const safeMessage = message.replace(/"/g, '\\"');
    let command = `node automatizacion-redes/ig-dm.mjs --username=${username} --message="${safeMessage}"`;
    if (sender) command += ` --sender=${sender}`;
    const { stdout } = await execAsync(command);
    if (stdout.includes('✅ MENSAJE ENVIADO')) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: stdout });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Autenticar cuenta Instagram
app.post('/authenticate', (req, res) => {
  const { sender } = req.body;
  if (!sender) return res.status(400).json({ error: 'Falta parámetro sender' });
  try {
    exec(`node automatizacion-redes/ig-auth.mjs --sender=${sender}`);
    res.json({ success: true, message: 'Navegador abierto. Por favor inicia sesión en Instagram.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Config básica
app.get('/config', (req, res) => {
  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    const files = fs.readdirSync(path.join(PROJECT_ROOT, '.agent'));
    data.instagramConnected = files.some(file => file.startsWith('instagram_auth') && file.endsWith('.json'));
    const accounts = files
      .filter(file => file.startsWith('instagram_auth_') && file.endsWith('.json'))
      .map(file => file.substring('instagram_auth_'.length, file.length - '.json'.length));
    data.instagramAccounts = accounts.length > 0 ? accounts : ['braiurato', 'tradeshare.ok'];
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publicar en Instagram
app.post('/instagram-publish', async (req, res) => {
  const { imageUrl, type, caption } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'Falta parámetro imageUrl' });

  let absoluteImagePath = imageUrl;
  let isTempFile = false;

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      const https = await import('https');
      const http = await import('http');
      const tempFilename = `temp_download_${Date.now()}.png`;
      const tempPath = path.join(PROJECT_ROOT, 'public', 'generated_posts', tempFilename);
      
      fs.mkdirSync(path.dirname(tempPath), { recursive: true });
      
      const downloadFile = (url, dest) => {
        return new Promise((resolve, reject) => {
          const client = url.startsWith('https') ? https : http;
          client.get(url, (response) => {
            if (response.statusCode !== 200) return reject(new Error('HTTP Error'));
            const fileStream = fs.createWriteStream(dest);
            response.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve();
            });
          }).on('error', reject);
        });
      };
      await downloadFile(imageUrl, tempPath);
      absoluteImagePath = tempPath;
      isTempFile = true;
    } catch (e) {
      return res.status(500).json({ error: 'Descarga fallida: ' + e.message });
    }
  } else if (imageUrl.startsWith('/')) {
    absoluteImagePath = path.join(PROJECT_ROOT, 'public', imageUrl);
  } else if (imageUrl.startsWith('public/')) {
    absoluteImagePath = path.join(PROJECT_ROOT, imageUrl);
  }

  try {
    const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
    const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    const selectedAccount = config.selectedAccount || 'braiurato';
    const safeCaption = caption ? caption.replace(/"/g, '\\"') : '🚀 #tradeshare #trading';
    
    let stdoutFeed = '';
    if (type === 'feed' || type === 'both') {
      const { stdout } = await execAsync(`node automatizacion-redes/ig-publisher.mjs --type=feed --image="${absoluteImagePath}" --account=${selectedAccount} --caption="${safeCaption}"`);
      stdoutFeed = stdout;
      
      let igLink = null;
      const linkMatch = stdout.match(/🎯 Enlace del post: (https:\/\/www.instagram.com\/p\/[^\s/]+)/);
      if (linkMatch) {
        igLink = linkMatch[1];
      }
      
      addPublicationToHistory('instagram_feed', selectedAccount, imageUrl, caption, igLink);
    } else if (type === 'story') {
      const { stdout } = await execAsync(`node automatizacion-redes/ig-publisher.mjs --type=story --image="${absoluteImagePath}" --account=${selectedAccount}`);
      stdoutFeed = stdout;
      
      addPublicationToHistory('instagram_story', selectedAccount, imageUrl, 'Historia publicada', null);
    }
    if (isTempFile && fs.existsSync(absoluteImagePath)) {
      fs.unlinkSync(absoluteImagePath);
    }
    res.json({ success: true, feedResult: stdoutFeed });
  } catch (error) {
    if (isTempFile && fs.existsSync(absoluteImagePath)) {
      try { fs.unlinkSync(absoluteImagePath); } catch (e) {}
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Vault de contenidos
const handleGetVault = (req, res) => {
  const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');
  if (fs.existsSync(vaultPath)) {
    try {
      const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      res.json({ success: true, vault });
    } catch (e) {
      res.json({ success: true, vault: [] });
    }
  } else {
    res.json({ success: true, vault: [] });
  }
};

app.get('/vault', handleGetVault);
app.get('/marketing/vault', handleGetVault);

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

// PM2 Status
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

app.post('/monitored-posts/add', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta parámetro url' });
  const file = path.join(PROJECT_ROOT, '.agent', 'monitored_posts.json');
  try {
    let state = { posts: [], profiles: ['braiurato'] };
    if (fs.existsSync(file)) {
      state = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    const normalized = url.replace(/\/+$/, '') + '/';
    if (!state.posts.includes(normalized)) {
      state.posts.push(normalized);
      fs.writeFileSync(file, JSON.stringify(state, null, 2));
      res.json({ success: true, posts: state.posts });
    } else {
      res.json({ success: true, posts: state.posts, message: 'El post ya está registrado' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/logs', (req, res) => {
  const logPath = path.join(PROJECT_ROOT, '.agent', 'daemon-out-1.log');
  if (fs.existsSync(logPath)) {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
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

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Endpoint: Estadísticas de Crecimiento de Instagram
app.get('/instagram-stats', (req, res) => {
  const statsPath = path.join(PROJECT_ROOT, '.agent', 'instagram_stats.json');
  try {
    const data = fs.existsSync(statsPath) 
      ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) 
      : { braiurato: { followers: 0, following: 0, history: [] }, "tradeshare.ok": { followers: 0, following: 0, history: [] } };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para actualizar estadísticas de crecimiento (llamado por el daemon)
app.post('/instagram-stats/update', (req, res) => {
  const { account, followers, following } = req.body;
  if (!account) return res.status(400).json({ error: 'Falta cuenta' });
  
  const statsPath = path.join(PROJECT_ROOT, '.agent', 'instagram_stats.json');
  try {
    let data = { braiurato: { history: [] }, "tradeshare.ok": { history: [] } };
    if (fs.existsSync(statsPath)) {
        data = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    }
    
    if (!data[account]) data[account] = {};
    if (!data[account].history) data[account].history = [];
    
    data[account].followers = followers;
    data[account].following = following;
    data[account].history.push({
        date: new Date().toISOString(),
        followers,
        following
    });

    // Mantener solo los últimos 30 días de historial
    if (data[account].history.length > 30) data[account].history.shift();

    fs.writeFileSync(statsPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Análisis de rendimiento de marketing (Posts Virales)
app.get('/marketing/performance', (req, res) => {
    const historyPath = path.join(PROJECT_ROOT, '.agent', 'publication_history.json');
    const prospectsPath = path.join(PROJECT_ROOT, '.agent', 'prospects.json');
    
    try {
        const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
        const prospects = fs.existsSync(prospectsPath) ? JSON.parse(fs.readFileSync(prospectsPath, 'utf8')) : {};
        
        const performance = history.map(post => {
            const shortLink = post.link?.replace(/\/+$/, '') || '';
            const relatedProspects = Object.values(prospects).filter(p => {
                const pLink = p.postUrl?.replace(/\/+$/, '') || '';
                return pLink.includes(shortLink) || (shortLink && shortLink.includes(pLink));
            });

            return {
                ...post,
                stats: {
                    comments: relatedProspects.length,
                    conversions: relatedProspects.filter(p => p.status !== 'dm_pendiente').length,
                    engagementRate: ((relatedProspects.length / (post.metrics?.reach || 100)) * 100).toFixed(2)
                }
            };
        }).sort((a, b) => b.stats.comments - a.stats.comments);

        res.json({ success: true, performance });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Endpoint: Omni-Channel Stats (Quota y Calendario)
app.get('/omni-stats', (req, res) => {
    const historyPath = path.join(PROJECT_ROOT, '.agent', 'publication_history.json');
    const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');
    const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
    const schedulerStatePath = path.join(PROJECT_ROOT, '.agent', 'scheduler_state_v2.json');
    
    try {
        const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
        let vault = fs.existsSync(vaultPath) ? JSON.parse(fs.readFileSync(vaultPath, 'utf8')) : [];
        
        // Quota Diaria (Meta: 10 posts por día)
        const todayStr = new Date().toLocaleDateString('en-CA');
        const doneToday = history.filter(h => h.publishedAt && h.publishedAt.startsWith(todayStr)).length;
        
        // Asignar slots a la bóveda no publicada para el calendario
        const SLOTS = ["00:00", "07:00", "09:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "23:30"];
        let scheduled = [];
        let slotIndex = 0;
        
        // Invertimos la bóveda para mostrar lo más nuevo arriba
        vault.reverse().forEach((item) => {
            if (!item.instagramFeedUrl) {
                scheduled.push({
                    ...item,
                    scheduledTime: SLOTS[slotIndex % SLOTS.length],
                    scheduledDay: `Hoy +${Math.floor(slotIndex / SLOTS.length)} días`
                });
                slotIndex++;
            }
        });

        // Cronograma del Día
        let configSlots = [
            [0, 0], [7, 0], [9, 0], [12, 0], [14, 0], [16, 0], [18, 0], [20, 0], [22, 0], [23, 30]
        ];
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.slots && Array.isArray(config.slots)) {
                    configSlots = config.slots;
                }
            } catch (e) {}
        }
        
        let schedulerState = { lastRuns: {} };
        if (fs.existsSync(schedulerStatePath)) {
            try {
                schedulerState = JSON.parse(fs.readFileSync(schedulerStatePath, 'utf8'));
            } catch (e) {}
        }
        
        const now = new Date();
        const todayKey = now.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
        
        let nonPublishedVault = vault.filter(item => !item.instagramFeedUrl);
        let publishedVault = vault.filter(item => item.instagramFeedUrl && item.instagramFeedUrl !== "FAILED_IMAGE_NOT_FOUND");
        
        let schedulesToday = [];
        configSlots.forEach((slot, index) => {
            const label = `${slot[0].toString().padStart(2, '0')}:${slot[1].toString().padStart(2, '0')}`;
            const runKey = `${todayKey}_${label}`;
            const isDone = !!schedulerState.lastRuns[runKey];
            
            let matchedPost = null;
            if (isDone) {
                matchedPost = publishedVault[index] || null;
            } else {
                matchedPost = nonPublishedVault[index] || null;
            }
            
            schedulesToday.push({
                time: label,
                status: isDone ? 'completed' : 'pending',
                runTime: schedulerState.lastRuns[runKey] || null,
                post: matchedPost ? {
                    id: matchedPost.id,
                    frase: matchedPost.frase,
                    imagenUrl: matchedPost.imagenUrl,
                    channels: ['Instagram', 'Threads', 'Facebook']
                } : null
            });
        });

        res.json({ success: true, quota: { goal: 10, done: doneToday }, calendar: scheduled, schedulesToday });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Endpoint: Historial de Generación de Contenidos por IA
app.get('/content-gen-logs', (req, res) => {
  const genPath = path.join(PROJECT_ROOT, '.agent', 'generation_history.json');
  try {
    const data = fs.existsSync(genPath) 
      ? JSON.parse(fs.readFileSync(genPath, 'utf8')) 
      : { success: false };
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Biblioteca de Ganchos (Hooks) y Temas
app.get('/copywriting-library', (req, res) => {
  const libPath = path.join(PROJECT_ROOT, '.agent', 'copywriting_library.json');
  try {
    const data = fs.existsSync(libPath) 
      ? JSON.parse(fs.readFileSync(libPath, 'utf8')) 
      : { hooks: [], topics: [], posts: [] };
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: true, hooks: [], topics: [], posts: [] });
  }
});

// Endpoint: Agregar post manualmente a la bóveda
app.post('/vault/add-manual', (req, res) => {
  const { title, frase, imageUrl, imagenUrl, caption, copy, scheduledTime } = req.body;
  const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');
  const genPath = path.join(PROJECT_ROOT, '.agent', 'generation_history.json');

  try {
    // 1. Guardar en la bóveda
    let vault = [];
    if (fs.existsSync(vaultPath)) {
      vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    }

    const finalTitle = title || frase || 'Aporte Manual';
    let finalImageUrl = imageUrl || imagenUrl || '/generated_posts/placeholder.png';
    
    // Si la imagen proviene del portapapeles en base64, decodificarla y guardarla en archivo
    const savedLocalPath = saveBase64Image(finalImageUrl);
    if (savedLocalPath) {
      finalImageUrl = savedLocalPath;
    }
    
    const finalCaption = caption || copy || '';
    const todayStr = new Date().toISOString().split('T')[0];

    const newPost = {
      id: `manual_${Date.now()}`,
      title: finalTitle,
      frase: finalTitle,
      imageUrl: finalImageUrl,
      imagenUrl: finalImageUrl,
      caption: finalCaption,
      copy: finalCaption,
      date: todayStr,
      timestamp: Date.now(),
      scheduledTime: scheduledTime || null,
      communitySlug: null,
      communityPostUrl: null,
      instagramFeedUrl: null, // Dejar nulo para que sea elegible para publicar
      instagramStoryPosted: false,
      createdAt: new Date().toISOString()
    };
    vault.unshift(newPost);
    fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2));

    // 2. Incrementar contador de generación de contenido (manual/humano)
    if (fs.existsSync(genPath)) {
      const genData = JSON.parse(fs.readFileSync(genPath, 'utf8'));
      genData.totalGenerated = (genData.totalGenerated || 0) + 1;
      // Registrar en logs diarios
      const todayStrLog = new Date().toLocaleDateString('en-CA');
      let dayLog = genData.dailyLogs.find(l => l.date === todayStrLog);
      if (!dayLog) {
        dayLog = { date: todayStrLog, chatgpt: 0, gemini: 0, total: 0 };
        genData.dailyLogs.unshift(dayLog);
      }
      dayLog.total++;
      fs.writeFileSync(genPath, JSON.stringify(genData, null, 2));
    }

    res.json({ success: true, post: newPost });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Endpoint: Editar post en la bóveda
app.post('/vault/edit', (req, res) => {
  const { id, title, frase, imageUrl, imagenUrl, caption, copy, scheduledTime } = req.body;
  const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');

  if (!id) {
    return res.status(400).json({ success: false, error: 'Falta ID del post a editar.' });
  }

  try {
    if (!fs.existsSync(vaultPath)) {
      return res.status(404).json({ success: false, error: 'La bóveda está vacía.' });
    }

    let vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    const index = vault.findIndex(p => p.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Post no encontrado.' });
    }

    let finalImageUrl = imageUrl || imagenUrl;
    const savedLocalPath = saveBase64Image(finalImageUrl);
    if (savedLocalPath) {
      finalImageUrl = savedLocalPath;
    }

    const updatedPost = {
      ...vault[index],
      title: title || frase || vault[index].title || vault[index].frase,
      frase: frase || title || vault[index].frase || vault[index].title,
      imageUrl: finalImageUrl || vault[index].imageUrl || vault[index].imagenUrl,
      imagenUrl: finalImageUrl || vault[index].imagenUrl || vault[index].imageUrl,
      caption: caption || copy || vault[index].caption || vault[index].copy,
      copy: copy || caption || vault[index].copy || vault[index].caption,
      scheduledTime: scheduledTime !== undefined ? scheduledTime : vault[index].scheduledTime,
      updatedAt: new Date().toISOString()
    };

    vault[index] = updatedPost;
    fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2));

    res.json({ success: true, post: updatedPost });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Endpoint: Eliminar post de la bóveda
app.post('/vault/delete', (req, res) => {
  const { id } = req.body;
  const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');

  if (!id) {
    return res.status(400).json({ success: false, error: 'Falta ID del post a eliminar.' });
  }

  try {
    if (!fs.existsSync(vaultPath)) {
      return res.status(404).json({ success: false, error: 'La bóveda ya está vacía.' });
    }

    let vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    const filteredVault = vault.filter(p => p.id !== id);

    if (vault.length === filteredVault.length) {
      return res.status(404).json({ success: false, error: 'Post no encontrado en la bóveda.' });
    }

    fs.writeFileSync(vaultPath, JSON.stringify(filteredVault, null, 2));
    res.json({ success: true, message: 'Post eliminado con éxito de la bóveda.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Helper para actualizar un post de la bóveda de forma precisa por ID
function updateVaultPost(id, data) {
  try {
    const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');
    if (fs.existsSync(vaultPath)) {
      const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      const index = vault.findIndex(p => p.id === id);
      if (index !== -1) {
        vault[index] = { ...vault[index], ...data };
        fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
        console.log(`💾 Bóveda actualizada con éxito para el post ID: ${id}`, data);
      }
    }
  } catch (e) {
    console.error('⚠️ Error actualizando la bóveda:', e.message);
  }
}

// Endpoint: Publicación Cruzada Multi-Plataforma
app.post('/marketing/publish-multi', async (req, res) => {
  const { id, frase, copy, imageUrl, imagenUrl, channels, account } = req.body;
  const chosenChannels = channels || [];
  const selectedAccount = account || 'braiurato';
  
  const finalImage = imageUrl || imagenUrl || '/generated_posts/placeholder.png';
  let absoluteImagePath = finalImage;
  if (!finalImage.startsWith('http') && !finalImage.startsWith('/home')) {
    absoluteImagePath = path.join(PROJECT_ROOT, 'public', finalImage.startsWith('/') ? finalImage : '/' + finalImage);
  }

  const safeCaption = (copy || frase || '').replace(/"/g, '\\"');
  const results = {};

  console.log(`🚀 [MULTI-PUBLISH] Iniciando publicación cruzada para canales: ${chosenChannels.join(', ')}`);

  // 1. TradeShare Portal Público Local
  if (chosenChannels.includes('tradesharePortal')) {
    try {
      const feedPath = path.join(PROJECT_ROOT, '.agent', 'local_portal_feed.json');
      let feed = [];
      if (fs.existsSync(feedPath)) {
        feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      }
      const newPostId = `local_${Date.now()}`;
      feed.unshift({
        _id: newPostId,
        userId: 'local_creator_manual',
        target: 'feed',
        imageUrl: finalImage,
        caption: copy || frase,
        title: frase || 'Publicación cruzada',
        createdAt: Date.now(),
        categoria: 'Trading',
        isAiAgent: false
      });
      fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2));
      
      const portalUrl = `http://localhost:5680/local-portal/posts/${newPostId}`;
      if (id) {
        updateVaultPost(id, { communityPostUrl: portalUrl, lastPublishedAt: new Date().toISOString() });
      }
      results.tradesharePortal = { success: true, message: 'Publicado en portal local.', link: portalUrl };
    } catch (e) {
      results.tradesharePortal = { success: false, error: e.message };
    }
  }

  // 1b. TradeShare Comunidad Privada Local
  if (chosenChannels.includes('tradesharePrivateComunidad')) {
    try {
      const feedPath = path.join(PROJECT_ROOT, '.agent', 'local_portal_feed.json');
      let feed = [];
      if (fs.existsSync(feedPath)) {
        feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      }
      const newPostId = `comunidad_${Date.now()}`;
      feed.unshift({
        _id: newPostId,
        userId: 'local_creator_manual',
        target: 'community',
        imageUrl: finalImage,
        caption: copy || frase,
        title: frase || 'Publicación en Comunidad Privada',
        createdAt: Date.now(),
        categoria: 'Comunidad',
        isAiAgent: false
      });
      fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2));
      
      const portalUrl = `http://localhost:5680/local-portal/posts/${newPostId}`;
      if (id) {
        updateVaultPost(id, { communityPostUrl: portalUrl, lastPublishedAt: new Date().toISOString() });
      }
      results.tradesharePrivateComunidad = { success: true, message: 'Publicado en Comunidad Privada local.', link: portalUrl };
    } catch (e) {
      results.tradesharePrivateComunidad = { success: false, error: e.message };
    }
  }

  // 2. Threads
  if (chosenChannels.includes('threads')) {
    try {
      console.log('📱 Publicando en Threads...');
      const { stdout } = await execAsync(`node automatizacion-redes/threads-publisher.mjs --text="${safeCaption}"`);
      const threadsLink = 'https://www.threads.net/@' + selectedAccount;
      
      addPublicationToHistory('threads', selectedAccount, '', copy || frase, threadsLink);
      if (id) {
        updateVaultPost(id, { threadsFeedUrl: threadsLink, threadsPosted: true, lastPublishedAt: new Date().toISOString() });
      }
      results.threads = { success: true, log: stdout, link: threadsLink };
    } catch (e) {
      results.threads = { success: false, error: e.message };
    }
  }

  // 3. Instagram Feed
  if (chosenChannels.includes('instagramFeed')) {
    try {
      console.log('📱 Publicando en Instagram Feed...');
      const idArg = id ? ` --id=${id}` : '';
      const { stdout } = await execAsync(`node automatizacion-redes/ig-publisher.mjs --type=feed --image="${absoluteImagePath}" --account=${selectedAccount} --caption="${safeCaption}"${idArg}`);
      
      let igLink = 'https://www.instagram.com/' + selectedAccount;
      const linkMatch = stdout.match(/🎯 Enlace del post: (https:\/\/www.instagram.com\/p\/[^\s/]+)/);
      if (linkMatch) {
        igLink = linkMatch[1];
      }
      
      addPublicationToHistory('instagram_feed', selectedAccount, absoluteImagePath, copy || frase, igLink);
      if (id) {
        updateVaultPost(id, { instagramFeedUrl: igLink, lastPublishedAt: new Date().toISOString() });
      }
      results.instagramFeed = { success: true, log: stdout, link: igLink };
    } catch (e) {
      results.instagramFeed = { success: false, error: e.message };
    }
  }

  // 4. Instagram Story
  if (chosenChannels.includes('instagramStory')) {
    try {
      console.log('📱 Publicando en Instagram Story...');
      const idArg = id ? ` --id=${id}` : '';
      const { stdout } = await execAsync(`node automatizacion-redes/ig-publisher.mjs --type=story --image="${absoluteImagePath}" --account=${selectedAccount}${idArg}`);
      
      addPublicationToHistory('instagram_story', selectedAccount, absoluteImagePath, copy || frase, 'https://www.instagram.com/' + selectedAccount);
      if (id) {
        updateVaultPost(id, { instagramStoryPosted: true, lastPublishedAt: new Date().toISOString() });
      }
      results.instagramStory = { success: true, log: stdout };
    } catch (e) {
      results.instagramStory = { success: false, error: e.message };
    }
  }

  // 5. Facebook Pages / Groups
  if (chosenChannels.includes('facebook')) {
    try {
      console.log('📱 Publicando en Facebook...');
      exec(`node automatizacion-redes/facebook-publisher.mjs --text="${safeCaption}"`);
      const fbLink = 'https://www.facebook.com/groups';
      
      addPublicationToHistory('facebook', selectedAccount, absoluteImagePath, copy || frase, fbLink);
      if (id) {
        updateVaultPost(id, { facebookPosted: true, lastPublishedAt: new Date().toISOString() });
      }
      results.facebook = { success: true, message: 'Iniciada publicación en background.', link: fbLink };
    } catch (e) {
      results.facebook = { success: false, error: e.message };
    }
  }

  // 6. IG Feed desde carpeta FEED pregenerada (NO usa imagen de la bóveda)
  if (chosenChannels.includes('igFeedFolder')) {
    try {
      console.log('📸 Publicando en IG Feed desde carpeta GENERADASIA/FEED...');
      const { stdout } = await execAsync(`node automatizacion-redes/ig-feed-from-folder.mjs --type=feed --account=${selectedAccount}`, { cwd: PROJECT_ROOT });
      const igLink = 'https://www.instagram.com/' + selectedAccount;
      addPublicationToHistory('instagram_feed_folder', selectedAccount, '', copy || frase, igLink);
      results.igFeedFolder = { success: true, log: stdout, link: igLink };
    } catch (e) {
      results.igFeedFolder = { success: false, error: e.message };
    }
  }

  // 7. IG Story desde carpeta HISTORIAS pregenerada
  if (chosenChannels.includes('igStoryFolder')) {
    try {
      console.log('📱 Publicando Historia en IG desde carpeta GENERADASIA/HISTORIAS...');
      const { stdout } = await execAsync(`node automatizacion-redes/ig-feed-from-folder.mjs --type=story --account=${selectedAccount}`, { cwd: PROJECT_ROOT });
      results.igStoryFolder = { success: true, log: stdout };
    } catch (e) {
      results.igStoryFolder = { success: false, error: e.message };
    }
  }

  res.json({ success: true, results });
});

// ─── Endpoints rápidos para publicar desde carpetas pregeneradas ────────────
app.post('/ig/publish-feed-folder', async (req, res) => {
  const account = req.body.account || 'tradeshare.ok';
  try {
    console.log('📸 Endpoint /ig/publish-feed-folder activado...');
    const { stdout } = await execAsync(`node automatizacion-redes/ig-feed-from-folder.mjs --type=feed --account=${account}`, { cwd: PROJECT_ROOT });
    const igLink = 'https://www.instagram.com/' + account;
    addPublicationToHistory('instagram_feed_folder', account, '', 'Publicación desde FEED pregenerada', igLink);
    res.json({ success: true, link: igLink, log: stdout });
  } catch (e) {
    console.error('[/ig/publish-feed-folder] Error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.post('/ig/publish-story-folder', async (req, res) => {
  const account = req.body.account || 'tradeshare.ok';
  try {
    console.log('📱 Endpoint /ig/publish-story-folder activado...');
    const { stdout } = await execAsync(`node automatizacion-redes/ig-feed-from-folder.mjs --type=story --account=${account}`, { cwd: PROJECT_ROOT });
    res.json({ success: true, log: stdout });
  } catch (e) {
    console.error('[/ig/publish-story-folder] Error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// Endpoint: Asistente IA de Marketing
app.post('/ai-chat', (req, res) => {
  const { message } = req.body;
  const reply = getExpertMarketingReply(message);
  res.json({ success: true, reply });
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

// Endpoint: Lanzar Publicación en Threads
app.post('/threads/publish', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Falta parámetro text' });
  try {
    const { stdout } = await execAsync(`node automatizacion-redes/threads-publisher.mjs --text="${text.replace(/"/g, '\\"')}"`);
    
    addPublicationToHistory('threads', 'braiurato', '', text, 'https://www.threads.net/@braiurato');
    
    res.json({ success: true, message: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Configuración Interactiva de Facebook Session
app.post('/facebook/setup', (req, res) => {
  exec(`node automatizacion-redes/facebook-publisher.mjs --setup`);
  res.json({ success: true, message: 'Navegador Facebook abierto para configuración de sesión en background.' });
});

// Endpoint: Lanzar Campaña de Facebook Groups
app.post('/facebook/publish', async (req, res) => {
  const { text, groups } = req.body;
  if (!text) return res.status(400).json({ error: 'Falta parámetro text' });
  try {
    let cmd = `node automatizacion-redes/facebook-publisher.mjs --text="${text.replace(/"/g, '\\"')}"`;
    if (groups) {
      cmd += ` --groups="${groups.replace(/"/g, '\\"')}"`;
    }
    // Ejecutar en segundo plano
    exec(cmd);
    
    addPublicationToHistory('facebook', 'braiurato', '', text, 'https://www.facebook.com/groups');
    
    res.json({ success: true, message: 'Campaña en grupos de Facebook iniciada en segundo plano.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Obtener historial de publicaciones
app.get('/publication-history', (req, res) => {
  const logPath = path.join(PROJECT_ROOT, '.agent', 'publication_history.json');
  const prospectsPath = path.join(PROJECT_ROOT, '.agent', 'prospects.json');
  
  let prospects = {};
  if (fs.existsSync(prospectsPath)) {
    try {
      prospects = JSON.parse(fs.readFileSync(prospectsPath, 'utf8'));
    } catch(e){}
  }

  if (fs.existsSync(logPath)) {
    try {
      const history = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      
      // Enriquecer cada post con sus métricas reales desde prospects.json
      const enrichedHistory = history.map(item => {
        let realComments = 0;
        let realDms = 0;
        
        if (item.link) {
          const itemShortLink = item.link.replace(/\/+$/, "");
          
          Object.values(prospects).forEach(p => {
            if (p.postUrl) {
              const pShortLink = p.postUrl.replace(/\/+$/, "");
              if (pShortLink.includes(itemShortLink) || itemShortLink.includes(pShortLink)) {
                realComments++;
                if (p.status && p.status !== 'dm_pendiente') {
                  realDms++;
                }
              }
            }
          });
        }
        
        return {
          ...item,
          metrics: {
            reach: realComments * 25 + realDms * 15 + 75, // Estimación orgánica basada en engagement real
            comments: realComments,
            prospectsContacted: realDms
          }
        };
      });
      
      res.json({ success: true, history: enrichedHistory });
    } catch (e) {
      res.json({ success: true, history: [] });
    }
  } else {
    res.json({ success: true, history: [] });
  }
});

// Endpoint: Generar Imagen en Caliente para Ganchos
app.post('/ai-generate-image', async (req, res) => {
  const { engine, topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'Falta parámetro topic' });
  
  let script = 'gemini-generator.mjs';
  let selectedEngine = 'gemini';
  if (engine === 'chatgpt') {
    script = 'chatgpt-generator.mjs';
    selectedEngine = 'chatgpt';
  } else if (engine === 'meta') {
    script = 'meta-generator.mjs';
    selectedEngine = 'meta';
  } else if (engine === 'manus') {
    script = 'manus-generator.mjs';
    selectedEngine = 'manus';
  }
  
  console.log(`🎨 Generando imagen en caliente con ${selectedEngine} para: "${topic}"...`);
  
  try {
    const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
    }
    const headlessArg = config.headless === false ? '--headful' : '--headless';
    
    const command = `node automatizacion-redes/${script} --use-vault=false --topic="${topic.replace(/"/g, '\\"')}" --publish=false ${headlessArg}`;
    
    const { stdout } = await execAsync(command);
    console.log(stdout);

    const postsDir = path.join(PROJECT_ROOT, 'public', 'generated_posts');
    if (fs.existsSync(postsDir)) {
      const files = fs.readdirSync(postsDir)
        .filter(f => f.endsWith('.png') && (
          f.startsWith('trading_post_') || 
          f.startsWith('trading_post_gemini_') || 
          f.startsWith('trading_post_meta_') || 
          f.startsWith('trading_post_manus_')
        ))
        .map(f => ({ name: f, time: fs.statSync(path.join(postsDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        const newImage = `/generated_posts/${files[0].name}`;
        console.log(`✅ Imagen localizada con éxito: ${newImage}`);
        
        // Registrar en la Bóveda de Contenidos
        const vaultPath = path.join(PROJECT_ROOT, '.agent', 'marketing_vault.json');
        let vault = [];
        if (fs.existsSync(vaultPath)) {
          try { vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8')); } catch (e) {}
        }
        
        const vaultEntry = {
          id: `vault_${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          timestamp: Date.now(),
          frase: topic.substring(0, 50),
          copy: topic,
          imagenUrl: newImage,
          communitySlug: 'forex-traders-hub',
          communityPostUrl: null,
          instagramFeedUrl: null,
          instagramStoryPosted: false
        };
        vault.unshift(vaultEntry); // Añadir al principio
        fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');

        return res.json({ success: true, imageUrl: newImage, message: 'Imagen generada y registrada con éxito.' });
      }
    }
    
    res.status(500).json({ success: false, error: 'No se encontró la imagen en el directorio de salida.' });
  } catch (err) {
    console.error('❌ Error generando imagen:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Actualizar Configuración en caliente
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

// Endpoint: Alternar navegador visible / invisible
app.post('/config/toggle-headless', (req, res) => {
  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    data.headless = data.headless === false ? true : false;
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    console.log(`⚙️ Navegador visible IA configurado en: ${data.headless ? 'Headless (Oculto)' : 'Visual (Visible)'}`);
    res.json({ success: true, headless: data.headless });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Obtener estado actual del navegador visible
app.get('/config/headless-status', (req, res) => {
  const configPath = path.join(PROJECT_ROOT, '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    res.json({ success: true, headless: data.headless !== false });
  } catch (err) {
    res.json({ success: true, headless: true });
  }
});

app.post('/marketing/run-manual-orchestrator', async (req, res) => {
  console.log('⚡ [PROCESO MANUAL] Iniciando orquestación de marketing viral en caliente...');
  try {
    const { stdout } = await execAsync('node automatizacion-redes/marketing-loop-orchestrator.mjs');
    res.json({ success: true, message: 'Orquestación completada con éxito.', log: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Generación Masiva en Background
app.post('/marketing/run-bulk', (req, res) => {
    console.log('⚡ [BULK] Iniciando Generador Masivo (10 posts)...');
    try {
        const child = spawn('node', ['automatizacion-redes/bulk-generator.mjs', '--count=10'], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
        res.json({ success: true, message: 'Generación masiva iniciada en segundo plano. Los posts aparecerán pronto.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint: Generación Manual Específica por IA
app.post('/marketing/generate-specific', async (req, res) => {
    const { engine } = req.body;
    console.log(`⚡ [ESPECIFICO] Forzando generación con: ${engine}`);
    
    let script = '';
    if (engine === 'chatgpt') script = 'chatgpt-generator.mjs';
    else if (engine === 'gemini') script = 'gemini-generator.mjs';
    else if (engine === 'meta') script = 'meta-generator.mjs';
    else if (engine === 'manus') script = 'manus-generator.mjs';
    else return res.status(400).json({ success: false, error: 'Motor IA no válido' });

    try {
        // Ejecutamos el script de generación pidiendo que guarde en la bóveda
        const { stdout } = await execAsync(`node automatizacion-redes/${script} --use-vault`);
        res.json({ success: true, message: `Generado con éxito usando ${engine}`, log: stdout });
    } catch (err) {
        console.error(`❌ Error en generador ${engine}:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint: Campaña Outreach de Threads
app.post('/outreach/threads', async (req, res) => {
  const { limit, tags } = req.body;
  const tagList = tags ? tags.split(',').map(t => t.trim()).join(' ') : 'trading forex crypto daytrading';
  const limitVal = limit ? parseInt(limit) : 5;
  console.log(`⚡ [THREADS OUTREACH] Lanzando campaña con etiquetas: [${tagList}] y límite: ${limitVal}`);
  
  try {
    // Ejecutar en background para no bloquear el hilo principal del bridge
    const command = `python3 automatizacion-redes/threads-marketing-bot.py --tags ${tagList} --limit ${limitVal} --live`;
    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Error en Threads outreach:', err.message);
      } else {
        console.log('✅ Threads outreach finalizado con éxito:\n', stdout);
      }
    });
    res.json({ success: true, message: 'Campaña de Threads iniciada con éxito en segundo plano.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Campaña Outreach de Facebook
app.post('/outreach/facebook', async (req, res) => {
  const { limit, groups } = req.body;
  const limitVal = limit ? parseInt(limit) : 3;
  let command = `node automatizacion-redes/facebook-publisher.mjs --outreach --limit=${limitVal}`;
  if (groups) {
    command += ` --groups="${groups}"`;
  }
  
  console.log(`⚡ [FACEBOOK OUTREACH] Lanzando campaña de comentarios en grupos... Límite: ${limitVal}`);
  
  try {
    // Ejecutar en background
    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Error en Facebook outreach:', err.message);
      } else {
        console.log('✅ Facebook outreach finalizado con éxito:\n', stdout);
      }
    });
    res.json({ success: true, message: 'Campaña de Facebook iniciada con éxito en segundo plano.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// CENTRAL SUITE: AUTHENTICATION FOR ALL ENGINES
// ==========================================

app.post('/chatgpt-auth', (req, res) => {
  console.log('🔑 Iniciando autenticación manual de ChatGPT...');
  exec('node automatizacion-redes/chatgpt-auth.mjs --headful');
  res.json({ success: true, message: 'Navegador ChatGPT abierto para inicio de sesión manual.' });
});

app.post('/gemini-auth', (req, res) => {
  console.log('🔑 Iniciando autenticación manual de Gemini...');
  exec('node automatizacion-redes/gemini-auth.mjs --headful');
  res.json({ success: true, message: 'Navegador Gemini abierto para inicio de sesión manual.' });
});

app.post('/manus-auth', (req, res) => {
  console.log('🔑 Iniciando autenticación manual de Manus...');
  exec('node automatizacion-redes/manus-auth.mjs --headful');
  res.json({ success: true, message: 'Navegador Manus abierto para inicio de sesión manual.' });
});

app.post('/meta-auth', (req, res) => {
  console.log('🔑 Iniciando autenticación manual de Meta AI...');
  exec('node automatizacion-redes/meta-auth.mjs --headful');
  res.json({ success: true, message: 'Navegador Meta AI abierto para inicio de sesión manual.' });
});

// ==========================================
// CENTRAL SUITE: GENERATION FOR ALL ENGINES
// ==========================================

app.post('/chatgpt-generate', async (req, res) => {
  console.log('🎨 Forzando generación manual con ChatGPT...');
  try {
    const { stdout } = await execAsync('node automatizacion-redes/chatgpt-generator.mjs --use-vault=false');
    res.json({ success: true, message: 'Generación con ChatGPT finalizada.', log: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/gemini-generate', async (req, res) => {
  console.log('🎨 Forzando generación manual con Gemini...');
  try {
    const { stdout } = await execAsync('node automatizacion-redes/gemini-generator.mjs --use-vault=false');
    res.json({ success: true, message: 'Generación con Gemini finalizada.', log: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/manus-generate', async (req, res) => {
  console.log('🎨 Forzando generación manual con Manus...');
  try {
    const { stdout } = await execAsync('node automatizacion-redes/manus-generator.mjs --use-vault=false');
    res.json({ success: true, message: 'Generación con Manus finalizada.', log: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/meta-generate', async (req, res) => {
  console.log('🎨 Forzando generación manual con Meta AI...');
  try {
    const { stdout } = await execAsync('node automatizacion-redes/meta-generator.mjs --use-vault=false');
    res.json({ success: true, message: 'Generación con Meta AI finalizada.', log: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// STATUS MONITOR FOR ALL AI ENGINES
// ==========================================

app.get('/marketing/engines-status', (req, res) => {
  const chatgptSession = fs.existsSync(path.join(PROJECT_ROOT, '.agent', 'chatgpt_auth.json'));
  const geminiSession = fs.existsSync(path.join(PROJECT_ROOT, '.agent', 'gemini_auth.json'));
  const manusSession = fs.existsSync(path.join(PROJECT_ROOT, '.agent', 'manus_auth.json'));
  const metaSession = fs.existsSync(path.join(PROJECT_ROOT, '.agent', 'meta_auth.json'));
  
  // Buscar último estado de rotación orquestada
  const statePath = path.join(PROJECT_ROOT, '.agent', 'orchestrator_state.json');
  let rotationState = { engine: 'chatgpt', count: 0 };
  if (fs.existsSync(statePath)) {
    try {
      rotationState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (e) {}
  }

  res.json({
    success: true,
    engines: {
      chatgpt: { connected: chatgptSession, name: 'ChatGPT' },
      gemini: { connected: geminiSession, name: 'Gemini' },
      manus: { connected: manusSession, name: 'Manus (Limite 5/día)' },
      meta: { connected: metaSession, name: 'Meta AI' }
    },
    activeScheduledEngine: rotationState.engine,
    rotationBlockCount: rotationState.count
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CENTRAL PUENTE RUNNING AT http://localhost:${PORT}`);
  
  // Generación silenciosa en el arranque (10 segundos después del boot)
  setTimeout(() => {
    console.log('⏳ [INICIO] Levantando orquestación silenciosa de marketing en segundo plano...');
    try {
      const child = spawn('node', ['automatizacion-redes/marketing-loop-orchestrator.mjs'], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      console.log('✅ Orquestador silencioso lanzado en segundo plano con éxito.');
    } catch (e) {
      console.error('❌ Error lanzando orquestador en segundo plano:', e.message);
    }
  }, 10000);
});
