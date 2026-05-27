import fs from 'fs';
import path from 'path';

// NOTA: Las keywords de comentarios se gestionan en keywords-master.mjs
// Este archivo sólo inicializa el ig-config.json si no existe.
// Para agregar/quitar keywords, editar keywords-master.mjs.

const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
if (!fs.existsSync(configPath)) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    headless: true,
    // commentKeywords no se define aquí — viene de keywords-master.mjs
    // Si querés agregar keywords extra al ig-config.json puedes definir:
    // "commentKeywords": ["mi_keyword_extra"]
    // Y el daemon las fusionará automáticamente con las del master.
    commentTemplate: "¡Hola! Te acabo de enviar todos los detalles por mensaje privado. ¡Revisa tu bandeja! 🌟"
  }, null, 2));
  console.log('✅ Configuración inicial guardada.');
} else {
  console.log('ℹ️ El archivo de configuración ya existe. Keywords cargadas desde keywords-master.mjs.');
}
