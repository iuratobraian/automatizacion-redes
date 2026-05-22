import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), '.agent', 'ig-config.json');
if (!fs.existsSync(configPath)) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    headless: true,
    commentKeywords: ["info", "precio", "link", "quiero"],
    commentTemplate: "¡Hola! Te acabo de enviar todos los detalles por mensaje privado. ¡Revisa tu bandeja! 🌟"
  }, null, 2));
  console.log('✅ Configuración inicial guardada.');
} else {
  console.log('ℹ️ El archivo de configuración ya existe.');
}
