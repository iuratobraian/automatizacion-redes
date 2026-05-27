/**
 * scheduler.mjs — TradeShare Social Growth OS Scheduler V2
 * Gestiona publicaciones programadas, autogeneración diaria de contenido, auto-asignación de slots y reciclaje.
 */

import cron from 'node-cron';
import { readPostsDB, savePostsDB } from './data-manager.mjs';
import { publishToIG } from './ig-publisher.mjs';
import { publishToThreads } from './threads-publisher.mjs';
import { generateDailyContent } from './content-auto-generator.mjs';

console.log('⏰ [SCHEDULER] Levantando daemon de cron jobs del Growth OS...');

// 1. CADA MINUTO: revisar publicaciones programadas
cron.schedule('* * * * *', checkAndPublish);

// 2. CADA DÍA A LAS 06:00: generar 15 imágenes automáticamente
cron.schedule('0 6 * * *', async () => {
  console.log('⏰ [SCHEDULER] Gatillando generación diaria autónoma a las 06:00...');
  try {
    await generateDailyContent();
  } catch (e) {
    console.error('⏰ [SCHEDULER] Error en generación de contenido diaria:', e.message);
  }
});

// 3. CADA DÍA A LAS 07:00: auto-programar publicaciones del día si hay slots vacíos
cron.schedule('0 7 * * *', () => {
  console.log('⏰ [SCHEDULER] Gatillando auto-programación diaria a las 07:00...');
  try {
    autoProgramDaySlots();
  } catch (e) {
    console.error('⏰ [SCHEDULER] Error en auto-programación diaria:', e.message);
  }
});

// 4. CADA 30 DÍAS: revisar posts para reciclar
cron.schedule('0 8 1 * *', () => {
  console.log('⏰ [SCHEDULER] Gatillando revisión de candidatos a reciclaje mensual...');
  try {
    checkRecycleCandidates();
  } catch (e) {
    console.error('⏰ [SCHEDULER] Error en revisión de reciclaje mensual:', e.message);
  }
});

/**
 * Revisa posts programados y los publica a su hora
 */
export async function checkAndPublish() {
  const db = readPostsDB();
  const now = new Date();
  let dbChanged = false;

  for (const post of db.posts) {
    for (const sched of post.scheduled) {
      if (sched.status === 'pending' && new Date(sched.scheduledAt) <= now) {
        console.log(`⏰ [SCHEDULER] ¡Hora detectada para publicar post ID: ${post.id} ("${post.title}")!`);
        sched.status = 'publishing';
        savePostsDB(db);

        const textToPublish = post.captions[0]?.text || '¡Mentalidad de Trading! 🚀 #tradeshare';
        const results = {};

        // 1. Instagram Feed
        if (sched.destinations.includes('ig_feed')) {
          try {
            console.log(`⏰ [SCHEDULER] Publicando en IG Feed...`);
            await publishToIG(post.filename, textToPublish, 'feed', 'tradeshare.ok', post.id);
            results.ig_feed = { success: true };
          } catch (e) {
            console.error(`⏰ [SCHEDULER] Error en IG Feed:`, e.message);
            results.ig_feed = { success: false, error: e.message };
          }
        }

        // 2. Instagram Story
        if (sched.destinations.includes('ig_story')) {
          try {
            console.log(`⏰ [SCHEDULER] Publicando en IG Story...`);
            await publishToIG(post.filename, textToPublish, 'story', 'tradeshare.ok', post.id);
            results.ig_story = { success: true };
          } catch (e) {
            console.error(`⏰ [SCHEDULER] Error en IG Story:`, e.message);
            results.ig_story = { success: false, error: e.message };
          }
        }

        // 3. Threads
        if (sched.destinations.includes('threads')) {
          try {
            console.log(`⏰ [SCHEDULER] Publicando en Threads...`);
            await publishToThreads(textToPublish);
            results.threads = { success: true };
          } catch (e) {
            console.error(`⏰ [SCHEDULER] Error en Threads:`, e.message);
            results.threads = { success: false, error: e.message };
          }
        }

        // Registrar en publicados
        const successDestinations = Object.keys(results).filter(k => results[k].success);
        if (successDestinations.length > 0) {
          sched.status = 'published';
          post.status = 'Posted';
          post.published.push({
            publishedAt: new Date().toISOString(),
            destinations: successDestinations,
            captionId: sched.captionId || 'c1',
            link: 'https://instagram.com/tradeshare.ok'
          });
        } else {
          sched.status = 'failed';
          post.status = 'Failed';
        }

        dbChanged = true;
      }
    }
  }

  if (dbChanged) {
    savePostsDB(db);
    console.log('⏰ [SCHEDULER] Base de datos guardada tras procesar agenda.');
  }
}

/**
 * Programa automáticamente cada día Feeds (3) e Historias (10) en slots vacíos
 */
export function autoProgramDaySlots() {
  console.log("📅 [SCHEDULER] Iniciando asignación automática de slots del día...");
  const db = readPostsDB();
  const todayStr = new Date().toISOString().split('T')[0];

  const feedSlots = ["09:00:00", "13:00:00", "19:00:00"];
  const storySlots = ["08:00:00", "09:30:00", "11:00:00", "12:30:00", "14:00:00", "15:30:00", "17:00:00", "18:30:00", "20:00:00", "21:30:00"];

  let candidatesReady = db.posts.filter(p => p.status === 'Ready');
  let candidatesRecycle = db.posts.filter(p => p.status === 'Recycle' || p.status === 'Recycle Candidate');

  // Si no hay candidatos con status listo, fallback a borradores auto-generados para no romper continuidad
  if (candidatesReady.length === 0 && candidatesRecycle.length === 0) {
    candidatesReady = db.posts.filter(p => p.status === 'Draft' || p.status === 'unposted');
  }

  let allCandidates = [...candidatesReady, ...candidatesRecycle];
  if (allCandidates.length === 0) {
    console.log("📅 [SCHEDULER] No hay candidatos elegibles disponibles para auto-programar.");
    return;
  }

  // Agrupar candidatos por categoría para rotarlos
  const categoriesMap = {};
  allCandidates.forEach(p => {
    const cat = p.category || 'Trading';
    if (!categoriesMap[cat]) categoriesMap[cat] = [];
    categoriesMap[cat].push(p);
  });

  const uniqueCategories = Object.keys(categoriesMap);
  let categoryIdx = 0;

  function getNextPostCandidate() {
    if (uniqueCategories.length === 0) return null;
    
    const startIdx = categoryIdx;
    do {
      const cat = uniqueCategories[categoryIdx];
      categoryIdx = (categoryIdx + 1) % uniqueCategories.length;

      const list = categoriesMap[cat];
      if (list && list.length > 0) {
        return list.shift();
      }
    } while (categoryIdx !== startIdx);

    return null;
  }

  let dbChanged = false;

  // Programar Feeds
  feedSlots.forEach(slot => {
    const slotTimeStr = `${todayStr}T${slot}`;
    const alreadyScheduled = db.posts.some(p => 
      p.scheduled.some(s => s.scheduledAt.startsWith(todayStr) && s.scheduledAt.includes(slot) && s.type === 'feed')
    );

    if (!alreadyScheduled) {
      const candidate = getNextPostCandidate();
      if (candidate) {
        candidate.scheduled.push({
          id: `s_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          scheduledAt: slotTimeStr,
          destinations: ["ig_feed", "threads"],
          captionId: candidate.captions[0]?.id || "c1",
          status: "pending",
          type: "feed"
        });
        candidate.status = "Scheduled";
        dbChanged = true;
        console.log(`📅 [SCHEDULER] Slot Auto-programado (FEED) a las ${slot} para post "${candidate.title}"`);
      }
    }
  });

  // Programar Historias
  storySlots.forEach(slot => {
    const slotTimeStr = `${todayStr}T${slot}`;
    const alreadyScheduled = db.posts.some(p => 
      p.scheduled.some(s => s.scheduledAt.startsWith(todayStr) && s.scheduledAt.includes(slot) && s.type === 'story')
    );

    if (!alreadyScheduled) {
      const candidate = getNextPostCandidate();
      if (candidate) {
        candidate.scheduled.push({
          id: `s_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          scheduledAt: slotTimeStr,
          destinations: ["ig_story"],
          captionId: candidate.captions[0]?.id || "c1",
          status: "pending",
          type: "story"
        });
        candidate.status = "Scheduled";
        dbChanged = true;
        console.log(`📅 [SCHEDULER] Slot Auto-programado (STORY) a las ${slot} para post "${candidate.title}"`);
      }
    }
  });

  if (dbChanged) {
    savePostsDB(db);
    console.log("📅 [SCHEDULER] Auto-programación guardada exitosamente.");
  }
}

/**
 * Analiza publicaciones publicadas hace más de 30 días para volverlas elegibles para reciclaje
 */
export function checkRecycleCandidates() {
  console.log("🔄 [SCHEDULER] Escaneando posts para marcar candidatos a reciclaje...");
  const db = readPostsDB();
  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  let dbChanged = false;

  db.posts.forEach(post => {
    const hasBeenPublished = post.published.length > 0;
    const hasPendingSchedule = post.scheduled.some(s => s.status === 'pending');
    
    if (hasBeenPublished && !hasPendingSchedule) {
      const lastPubDate = new Date(post.published[post.published.length - 1].publishedAt);
      if (now - lastPubDate >= thirtyDaysMs) {
        post.status = "Recycle Candidate";
        dbChanged = true;
        console.log(`🔄 [SCHEDULER] Post "${post.title}" marcado como candidato a reciclaje.`);
      }
    }
  });

  if (dbChanged) {
    savePostsDB(db);
    console.log("🔄 [SCHEDULER] Estados de reciclaje actualizados.");
  }
}
