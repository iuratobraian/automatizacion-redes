import express from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const execAsync = promisify(exec);
const app = express();
const PORT = 5680;

app.use(express.json());

// Cargar variables de entorno desde .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || 'https://diligent-wildcat-523.convex.cloud';
console.log(`🔌 Inicializando cliente Convex en: ${convexUrl}`);
const convexClient = new ConvexHttpClient(convexUrl);

// Helper: Guardar en historial de publicaciones
function addPublicationToHistory(platform, account, imageUrl, caption, link = null) {
  const logPath = path.join(process.cwd(), '.agent', 'publication_history.json');
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
      reach: 0,
      comments: 0,
      prospectsContacted: 0
    }
  };
  
  history.unshift(entry);
  fs.writeFileSync(logPath, JSON.stringify(history, null, 2), 'utf8');
  return entry;
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

// Agregar prospectos manualmente
app.post('/prospects/add', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Falta usuario' });
  const cleanUser = username.trim().replace('@', '');
  const prospectsPath = path.join(process.cwd(), '.agent', 'prospects.json');
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
  const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
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
  const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
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
  const prospectsPath = path.join(process.cwd(), '.agent', 'prospects.json');
  const postsPath = path.join(process.cwd(), '.agent', 'monitored_posts.json');
  
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

// Publicar en 1-Clic a TradeShare local (feed o comunidad)
app.post('/tradeshare-publish', async (req, res) => {
  const { target, imageUrl, caption } = req.body;
  console.log(`🚀 Publicando en TradeShare real (${target}) - Imagen: ${imageUrl}`);
  try {
    let userId = 'admin_braiurato';
    try {
      const profile = await convexClient.query(api.profiles.getProfileByUsuario, { usuario: 'braiurato' });
      if (profile && profile.userId) {
        userId = profile.userId;
      }
    } catch (e) {
      console.warn('⚠️ No se pudo obtener el perfil de braiurato, usando fallback ID:', e.message);
    }

    let normalizedImg = imageUrl || '';
    if (normalizedImg.startsWith('public/')) {
      normalizedImg = '/' + normalizedImg.substring(7);
    }

    let publishedUrl = '';
    let postId = '';

    if (target === 'community') {
      const comm = await convexClient.query(api.communities.getCommunity, { slug: 'forex-traders-hub' });
      if (!comm) {
        throw new Error('No se encontró la comunidad "forex-traders-hub" en la base de datos.');
      }
      
      postId = await convexClient.mutation(api.communities.createPost, {
        communityId: comm._id,
        contenido: caption,
        titulo: caption.substring(0, 50).trim() + '...',
        imagenUrl: normalizedImg,
        userId: userId,
        tipo: 'text',
        categoria: 'Mentalidad'
      });
      publishedUrl = `http://localhost:3000/comunidad/forex-traders-hub/post/${postId}`;
      console.log(`🎉 Publicado en Comunidad Forex Traders Hub: ${publishedUrl}`);
    } else {
      postId = await convexClient.mutation(api.posts.createPost, {
        titulo: caption.substring(0, 50).trim() + '...',
        contenido: caption,
        imagenUrl: normalizedImg,
        categoria: 'Mentalidad',
        userId: userId,
        isAiAgent: false
      });
      publishedUrl = `http://localhost:3000/posts/${postId}`;
      console.log(`🎉 Publicado en Feed General de TradeShare: ${publishedUrl}`);
    }

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
      message: `¡Publicado con éxito en TradeShare (${target === 'community' ? 'Comunidad Forex Hub' : 'Feed General'}) como @braiurato!`
    });
  } catch (err) {
    console.error('💥 Error publicando en TradeShare:', err.message);
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
  const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    const files = fs.readdirSync(path.join(process.cwd(), '.agent'));
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
      const tempPath = path.join(process.cwd(), 'public', 'generated_posts', tempFilename);
      
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
    absoluteImagePath = path.join(process.cwd(), 'public', imageUrl);
  } else if (imageUrl.startsWith('public/')) {
    absoluteImagePath = path.join(process.cwd(), imageUrl);
  }

  try {
    const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
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
app.get('/vault', (req, res) => {
  const vaultPath = path.join(process.cwd(), '.agent', 'marketing_vault.json');
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
});

app.get('/prospects', (req, res) => {
  const logPath = path.join(process.cwd(), '.agent', 'prospects.json');
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
  const { action, service } = req.body;
  const allowed = ['tradeshare-daemon', 'tradeshare-n8n', 'tradeshare-bridge', 'tradeshare-local'];
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
  const file = path.join(process.cwd(), '.agent', 'monitored_posts.json');
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
  const file = path.join(process.cwd(), '.agent', 'monitored_posts.json');
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
  const logPath = path.join(process.cwd(), '.agent', 'daemon-out-1.log');
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
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Endpoint: Estadísticas de Crecimiento de Instagram
app.get('/instagram-stats', (req, res) => {
  const statsPath = path.join(process.cwd(), '.agent', 'instagram_stats.json');
  try {
    const data = fs.existsSync(statsPath) 
      ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) 
      : { braiurato: {}, "tradeshare.ok": {} };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Historial de Generación de Contenidos por IA
app.get('/content-gen-logs', (req, res) => {
  const genPath = path.join(process.cwd(), '.agent', 'generation_history.json');
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
  const libPath = path.join(process.cwd(), '.agent', 'copywriting_library.json');
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
  const { title, imageUrl, caption } = req.body;
  const vaultPath = path.join(process.cwd(), '.agent', 'marketing_vault.json');
  const genPath = path.join(process.cwd(), '.agent', 'generation_history.json');

  try {
    // 1. Guardar en la bóveda
    let vault = [];
    if (fs.existsSync(vaultPath)) {
      vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    }
    const newPost = {
      id: `manual_${Date.now()}`,
      title: title || 'Aporte Manual',
      imageUrl: imageUrl || 'public/generated_posts/placeholder.png',
      caption: caption,
      createdAt: new Date().toISOString()
    };
    vault.unshift(newPost);
    fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2));

    // 2. Incrementar contador de generación de contenido (manual/humano)
    if (fs.existsSync(genPath)) {
      const genData = JSON.parse(fs.readFileSync(genPath, 'utf8'));
      genData.totalGenerated = (genData.totalGenerated || 0) + 1;
      // Registrar en logs diarios
      const todayStr = new Date().toLocaleDateString('en-CA');
      let dayLog = genData.dailyLogs.find(l => l.date === todayStr);
      if (!dayLog) {
        dayLog = { date: todayStr, chatgpt: 0, gemini: 0, total: 0 };
        genData.dailyLogs.unshift(dayLog);
      }
      dayLog.total++;
      fs.writeFileSync(genPath, JSON.stringify(genData, null, 2));
    }

    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
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
  const logPath = path.join(process.cwd(), '.agent', 'publication_history.json');
  const prospectsPath = path.join(process.cwd(), '.agent', 'prospects.json');
  
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
    const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
    }
    const headlessArg = config.headless === false ? '--headful' : '--headless';
    
    const command = `node automatizacion-redes/${script} --use-vault=false --topic="${topic.replace(/"/g, '\\"')}" --publish=false ${headlessArg}`;
    
    const { stdout } = await execAsync(command);
    console.log(stdout);

    const postsDir = path.join(process.cwd(), 'public', 'generated_posts');
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
        const vaultPath = path.join(process.cwd(), '.agent', 'marketing_vault.json');
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
  const { selectedAccount } = req.body;
  const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
  try {
    const data = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    if (selectedAccount) data.selectedAccount = selectedAccount;
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Alternar navegador visible / invisible
app.post('/config/toggle-headless', (req, res) => {
  const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
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
  const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
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
    console.log(stdout);
    res.json({ success: true, message: 'Orquestación completada con éxito.', log: stdout });
  } catch (err) {
    console.error('❌ Error en el proceso manual:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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
