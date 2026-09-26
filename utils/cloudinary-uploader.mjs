/**
 * cloudinary-uploader.mjs
 * Sube imágenes locales a Cloudinary (CDN) usando el preset de TradeShare
 * para que las publicaciones en TradeShare Feed siempre tengan imagen visible.
 */

import fs from 'fs';
import path from 'path';

const CLOUDINARY_CLOUD_NAME = 'dpm4bnral';
const CLOUDINARY_UPLOAD_PRESET = 'tradeshare_uploads';

export async function uploadImageToCDN(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') return null;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    if (!fs.existsSync(filePath)) return null;

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const blob = new Blob([fileBuffer], { type: mimeType });
    const fd = new FormData();
    fd.append('file', blob, path.basename(filePath));
    fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: fd
    });
    const data = await res.json();
    if (data?.secure_url) {
      console.log(`☁️ [Cloudinary CDN] Imagen subida exitosamente: ${data.secure_url}`);
      return data.secure_url;
    }
  } catch (err) {
    console.warn(`⚠️ [Cloudinary CDN] Error subiendo imagen: ${err.message}`);
  }
  return null;
}
