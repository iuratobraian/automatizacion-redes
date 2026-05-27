// utils/imageHelper.js
// Utility to wait for image generation to complete before proceeding.
// Uses Playwright page instance to poll for a valid, large image element.

import fs from 'fs';
import path from 'path';

/**
 * Waits until a large generated image (>300px wide) appears on the page.
 * Polls every 3 seconds, checking for images matching the selector that
 * are fully loaded and not avatars/icons.
 *
 * @param {import('playwright').Page} page - Playwright page object.
 * @param {string} selector - CSS selector for candidate image elements.
 * @param {number} [timeout=180000] - Maximum wait time in milliseconds (default 3 min).
 * @returns {Promise<string>} The src URL of the first valid large image found.
 */
export async function awaitImageGeneration(page, selector = 'img', timeout = 180000) {
  const start = Date.now();
  const pollInterval = 3000;

  while (Date.now() - start < timeout) {
    try {
      const result = await page.evaluate((sel) => {
        const imgs = Array.from(document.querySelectorAll(sel));
        for (const img of imgs.reverse()) {
          const src = img.getAttribute('src') || '';
          if (!src || src.startsWith('data:image/svg')) continue;
          // Skip tiny images (avatars, icons)
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (w < 300 || h < 300) continue;
          // Skip known non-generated images
          if (src.includes('avatar') || src.includes('logo') || src.includes('auth0')) continue;
          // Check if fully loaded
          if (img.complete && img.naturalWidth > 0) {
            return src;
          }
        }
        return null;
      }, selector);

      if (result) {
        console.log(`✅ [imageHelper] Imagen generada detectada (${Math.round((Date.now() - start) / 1000)}s): ${result.substring(0, 80)}...`);
        return result;
      }
    } catch (e) {
      // Ignore evaluation errors and retry
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 15 === 0 && elapsed > 0) {
      console.log(`⏳ [imageHelper] Esperando imagen generada... (${elapsed}s / ${timeout / 1000}s)`);
    }
    await page.waitForTimeout(pollInterval);
  }

  throw new Error(`[imageHelper] La imagen no se generó dentro de ${timeout / 1000}s para selector "${selector}".`);
}

/**
 * Downloads an image from a URL (or blob URL) using the page context
 * and saves it to disk. Returns the local file path.
 *
 * @param {import('playwright').Page} page
 * @param {string} imgSrc - The image URL (can be blob: or http)
 * @param {string} destPath - Absolute path to save the image
 * @returns {Promise<string>} The saved file path
 */
export async function downloadAndSaveImage(page, imgSrc, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let buffer;

  if (imgSrc.startsWith('blob:')) {
    // Extract blob data via page context
    const bytes = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    }, imgSrc);
    buffer = Buffer.from(bytes);
  } else {
    // Use Playwright's request API for regular URLs
    const response = await page.request.get(imgSrc);
    buffer = await response.body();
  }

  fs.writeFileSync(destPath, buffer);
  console.log(`💾 [imageHelper] Imagen guardada: ${destPath} (${Math.round(buffer.length / 1024)}KB)`);
  return destPath;
}
