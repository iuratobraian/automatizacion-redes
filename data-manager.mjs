import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, '.agent');
const POSTS_DB = path.join(DATA_DIR, 'posts-db.json');
const STATS_DB = path.join(DATA_DIR, 'stats-db.json');
const LEADS_DB = path.join(DATA_DIR, 'leads-db.json');
const PROMPTS_DB = path.join(DATA_DIR, 'prompts-db.json');
const VAULT_FILE = path.join(DATA_DIR, 'marketing_vault.json');
const MONITORED_FILE = path.join(DATA_DIR, 'monitored_posts.json');
const INSTAGRAM_STATS = path.join(DATA_DIR, 'instagram_stats.json');
const PROSPECTS_FILE = path.join(DATA_DIR, 'prospects.json');

// Asegurar que exista la carpeta .agent
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Lee la base de datos de posts (con fallback a marketing_vault.json)
 */
export function readPostsDB() {
  try {
    if (fs.existsSync(POSTS_DB)) {
      return JSON.parse(fs.readFileSync(POSTS_DB, 'utf-8'));
    }
  } catch (e) {
    console.error('Error leyendo posts-db.json:', e.message);
  }

  // Fallback y migración inicial desde marketing_vault.json
  let posts = [];
  if (fs.existsSync(VAULT_FILE)) {
    try {
      const vault = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf-8'));
      posts = vault.map(item => {
        // Mapear el esquema existente al nuevo posts-db.json
        const captions = [];
        if (item.copy || item.caption) {
          captions.push({
            id: 'c1',
            label: 'Caption por Defecto',
            text: item.copy || item.caption
          });
        }
        
        const scheduled = [];
        if (item.scheduledTime) {
          scheduled.push({
            scheduledAt: item.scheduledTime.includes('T') ? item.scheduledTime : new Date().toISOString().split('T')[0] + 'T' + item.scheduledTime,
            destinations: ['ig_feed', 'threads', 'facebook'],
            captionId: 'c1',
            status: item.instagramFeedUrl ? 'published' : 'pending'
          });
        }

        const published = [];
        if (item.instagramFeedUrl) {
          published.push({
            publishedAt: item.lastPublishedAt || new Date().toISOString(),
            destinations: ['ig_feed'],
            captionId: 'c1',
            link: item.instagramFeedUrl
          });
        }

        return {
          id: item.id || `post_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          filename: item.imagenUrl || item.imageUrl || '',
          captions,
          scheduled,
          published,
          title: item.title || item.frase || 'Aporte Sin Título',
          createdAt: item.createdAt || new Date().toISOString()
        };
      });
    } catch (err) {
      console.error('Error migrando marketing_vault.json:', err.message);
    }
  }

  const db = { posts };
  savePostsDB(db);
  return db;
}

/**
 * Guarda la base de datos de posts e integra los cambios de vuelta en marketing_vault.json para compatibilidad
 */
export function savePostsDB(db) {
  try {
    fs.writeFileSync(POSTS_DB, JSON.stringify(db, null, 2), 'utf-8');
    
    // Sincronizar hacia atrás con marketing_vault.json
    const vault = db.posts.map(post => {
      const activeCaption = post.captions[0]?.text || '';
      const lastSched = post.scheduled[post.scheduled.length - 1];
      const lastPub = post.published[post.published.length - 1];

      return {
        id: post.id,
        title: post.title,
        frase: post.title,
        imageUrl: post.filename,
        imagenUrl: post.filename,
        caption: activeCaption,
        copy: activeCaption,
        date: post.createdAt ? post.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
        timestamp: new Date(post.createdAt).getTime() || Date.now(),
        scheduledTime: lastSched ? lastSched.scheduledAt : null,
        instagramFeedUrl: lastPub ? lastPub.link : null,
        instagramStoryPosted: post.published.some(p => p.destinations.includes('ig_story')),
        createdAt: post.createdAt
      };
    });
    
    fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error guardando posts-db.json:', e.message);
    return false;
  }
}

/**
 * Lee las estadísticas del CRM y el estado de los bots
 */
export function readStatsDB() {
  let stats = {
    followersReal: 0,
    postsToday: 0,
    commentsManaged: 0,
    dmsSent: 0,
    conversionRate: 0,
    growthHistory: [],
    bots: {
      daemon: { name: "Instagram Daemon Listener", status: "inactive" },
      threadsOutreach: { name: "Threads Outreach Bot", status: "inactive" },
      threadsQuotes: { name: "Threads Quotes Bot", status: "inactive" },
      scheduler: { name: "Daily Content Scheduler", status: "inactive" }
    }
  };

  try {
    if (fs.existsSync(STATS_DB)) {
      return JSON.parse(fs.readFileSync(STATS_DB, 'utf-8'));
    }
  } catch (e) {}

  // Fallback e integración de archivos reales
  try {
    // 1. Seguidores y Crecimiento de Instagram
    if (fs.existsSync(INSTAGRAM_STATS)) {
      const igStats = JSON.parse(fs.readFileSync(INSTAGRAM_STATS, 'utf-8'));
      const mainAcc = igStats['tradeshare.ok'] || igStats['braiurato'] || {};
      stats.followersReal = mainAcc.followers || 0;
      stats.growthHistory = (mainAcc.history || []).map(h => ({
        date: h.date ? h.date.split('T')[0] : new Date().toLocaleDateString('es-AR'),
        value: h.followers
      }));
    }

    // 2. DMs Enviados y Conversiones (Prospects)
    if (fs.existsSync(PROSPECTS_FILE)) {
      const prospects = JSON.parse(fs.readFileSync(PROSPECTS_FILE, 'utf-8'));
      const items = Object.values(prospects);
      stats.commentsManaged = items.length;
      stats.dmsSent = items.filter(p => p.status !== 'dm_pendiente').length;
      if (stats.commentsManaged > 0) {
        stats.conversionRate = Math.round((stats.dmsSent / stats.commentsManaged) * 100);
      }
    }

    // 3. Posts publicados hoy
    const postsDb = readPostsDB();
    const todayStr = new Date().toISOString().split('T')[0];
    stats.postsToday = postsDb.posts.filter(p => 
      p.published.some(pub => pub.publishedAt && pub.publishedAt.startsWith(todayStr))
    ).length;

  } catch (err) {
    console.error('Error recolectando estadísticas en data-manager:', err.message);
  }

  saveStatsDB(stats);
  return stats;
}

/**
 * Guarda las estadísticas
 */
export function saveStatsDB(stats) {
  try {
    fs.writeFileSync(STATS_DB, JSON.stringify(stats, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error guardando stats-db.json:', e.message);
    return false;
  }
}

/**
 * Lee la base de datos de Leads CRM
 */
export function readLeadsDB() {
  try {
    if (fs.existsSync(LEADS_DB)) {
      const db = JSON.parse(fs.readFileSync(LEADS_DB, 'utf-8'));
      let changed = false;
      if (!Array.isArray(db.leads)) {
        db.leads = [];
        changed = true;
      }
      if (!Array.isArray(db.b2b_leads)) {
        db.b2b_leads = [];
        changed = true;
      }
      if (changed) saveLeadsDB(db);
      return db;
    }
  } catch (e) {
    console.error('Error leyendo leads-db.json:', e.message);
  }
  const db = { leads: [], b2b_leads: [] };
  saveLeadsDB(db);
  return db;
}

/**
 * Guarda la base de datos de Leads CRM
 */
export function saveLeadsDB(db) {
  try {
    fs.writeFileSync(LEADS_DB, JSON.stringify(db, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error guardando leads-db.json:', e.message);
    return false;
  }
}

/**
 * Lee la base de datos de Prompts
 */
export function readPromptsDB() {
  try {
    if (fs.existsSync(PROMPTS_DB)) {
      return JSON.parse(fs.readFileSync(PROMPTS_DB, 'utf-8'));
    }
  } catch (e) {
    console.error('Error leyendo prompts-db.json:', e.message);
  }
  const db = { prompts: [] };
  savePromptsDB(db);
  return db;
}

/**
 * Guarda la base de datos de Prompts
 */
export function savePromptsDB(db) {
  try {
    fs.writeFileSync(PROMPTS_DB, JSON.stringify(db, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error guardando prompts-db.json:', e.message);
    return false;
  }
}
