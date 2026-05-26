import cron from 'node-cron';
import { readPostsDB, savePostsDB } from './data-manager.mjs';
import { publishToIG } from './ig-publisher.mjs';
import { publishToThreads } from './threads-publisher.mjs';

console.log('⏰ [SCHEDULER] Iniciando daemon de publicaciones programadas...');

// Ejecutar cada minuto
cron.schedule('* * * * *', async () => {
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
          post.published.push({
            publishedAt: new Date().toISOString(),
            destinations: successDestinations,
            captionId: 'c1',
            link: 'https://instagram.com/tradeshare.ok'
          });
        } else {
          sched.status = 'failed';
        }

        dbChanged = true;
      }
    }
  }

  if (dbChanged) {
    savePostsDB(db);
    console.log('⏰ [SCHEDULER] Base de datos de posts guardada tras procesar agenda.');
  }
});
