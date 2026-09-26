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

        const textToPublish = post.captions[0]?.text || '¡TradeShare: Bitácora Pro auditada y comunidades en trade-share.com! 🚀 Vamos a competir.';
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
 * Limpia duplicados en la base de datos de posts
 */
export function deduplicatePostsDB(db) {
  const seenPaths = new Set();
  const seenBasenames = new Set();
  const cleanPosts = [];
  let dupCount = 0;

  db.posts.forEach(post => {
    const rawPath = post.filepath || post.filename || '';
    const baseName = path.basename(rawPath).toLowerCase();
    
    // Si ya existe un post con el mismo path o mismo nombre de archivo físico
    if (seenPaths.has(rawPath) || (baseName && seenBasenames.has(baseName))) {
      dupCount++;
      return;
    }

    if (rawPath) seenPaths.add(rawPath);
    if (baseName) seenBasenames.add(baseName);

    // Normalizar estados indefinidos a Ready si tienen archivo físico
    if (!post.status || post.status === 'undefined') {
      post.status = 'Ready';
    }
    cleanPosts.push(post);
  });

  if (dupCount > 0) {
    console.log(`🧹 [SCHEDULER] Removidos ${dupCount} posts duplicados de la bóveda.`);
    db.posts = cleanPosts;
  }
  return dupCount;
}

/**
 * Organiza la bóveda de medios día tras día para los próximos N días en los horarios clave de trading
 */
export function organizeVaultDailySchedule(daysAhead = 14) {
  console.log(`📅 [SCHEDULER] Organizando bóveda de medios para los próximos ${daysAhead} días...`);
  const db = readPostsDB();
  deduplicatePostsDB(db);

  // Horarios de mayor impacto y volumen en redes de trading
  const feedSlots = ["09:30:00", "14:00:00", "20:00:00"];
  const storySlots = ["10:30:00", "16:00:00", "21:30:00"];

  let scheduledCount = 0;
  let dbChanged = false;
  const now = new Date();

  // Obtener lista de candidatos sin programar
  let candidates = db.posts.filter(p => {
    const isUnscheduled = !p.scheduled || p.scheduled.filter(s => s.status === 'pending').length === 0;
    const isNotPosted = p.status !== 'Posted';
    return isUnscheduled && isNotPosted;
  });

  console.log(`📊 [SCHEDULER] ${candidates.length} candidatos listos para ser organizados en la agenda diaria.`);

  for (let d = 0; d < daysAhead; d++) {
    const targetDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const dateStr = targetDate.toISOString().split('T')[0];

    // 1. Programar slots de Feed / Reels / Carruseles del día
    for (const slot of feedSlots) {
      const slotTimeStr = `${dateStr}T${slot}`;
      const isPast = new Date(slotTimeStr) <= now;
      if (isPast) continue;

      const alreadyScheduled = db.posts.some(p => 
        p.scheduled && p.scheduled.some(s => s.scheduledAt.startsWith(dateStr) && s.scheduledAt.includes(slot) && s.type === 'feed')
      );

      if (!alreadyScheduled && candidates.length > 0) {
        // Priorizar videos para el slot de las 20:00 si existen
        let candidateIdx = -1;
        if (slot === "20:00:00") {
          candidateIdx = candidates.findIndex(p => p.mediaType === 'video' || p.category === 'Video');
        }
        if (candidateIdx === -1) {
          candidateIdx = candidates.findIndex(p => p.filepath?.includes('feed') || !p.filepath?.includes('historias'));
        }
        if (candidateIdx === -1) candidateIdx = 0;

        const candidate = candidates.splice(candidateIdx, 1)[0];
        if (candidate) {
          if (!candidate.scheduled) candidate.scheduled = [];
          candidate.scheduled.push({
            id: `s_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            scheduledAt: slotTimeStr,
            destinations: ["ig_feed", "threads"],
            captionId: candidate.captions?.[0]?.id || "c1",
            status: "pending",
            type: "feed"
          });
          candidate.status = "Scheduled";
          scheduledCount++;
          dbChanged = true;
          console.log(`📅 [SCHEDULER] [${dateStr} ${slot}] FEED/REEL: "${candidate.title}"`);
        }
      }
    }

    // 2. Programar slots de Historias del día
    for (const slot of storySlots) {
      const slotTimeStr = `${dateStr}T${slot}`;
      const isPast = new Date(slotTimeStr) <= now;
      if (isPast) continue;

      const alreadyScheduled = db.posts.some(p => 
        p.scheduled && p.scheduled.some(s => s.scheduledAt.startsWith(dateStr) && s.scheduledAt.includes(slot) && s.type === 'story')
      );

      if (!alreadyScheduled && candidates.length > 0) {
        let candidateIdx = candidates.findIndex(p => p.filepath?.includes('historias'));
        if (candidateIdx === -1) candidateIdx = 0;

        const candidate = candidates.splice(candidateIdx, 1)[0];
        if (candidate) {
          if (!candidate.scheduled) candidate.scheduled = [];
          candidate.scheduled.push({
            id: `s_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            scheduledAt: slotTimeStr,
            destinations: ["ig_story"],
            captionId: candidate.captions?.[0]?.id || "c1",
            status: "pending",
            type: "story"
          });
          candidate.status = "Scheduled";
          scheduledCount++;
          dbChanged = true;
          console.log(`📱 [SCHEDULER] [${dateStr} ${slot}] HISTORIA: "${candidate.title}"`);
        }
      }
    }
  }

  if (dbChanged) {
    savePostsDB(db);
    console.log(`✅ [SCHEDULER] Organización completada: ${scheduledCount} publicaciones agendadas día tras día.`);
  }

  return { success: true, scheduledCount, daysAhead };
}

/**
 * Programa automáticamente cada día Feeds (3) e Historias (3) en slots vacíos
 */
export function autoProgramDaySlots() {
  return organizeVaultDailySchedule(7);
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
