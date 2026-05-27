import { getCdpUrl } from 'playwriter';
import axios from 'axios';

/**
 * Resuelve dinámicamente la URL CDP correcta consultando las extensiones activas en el daemon.
 * Esto evita el error de "Multiple extensions connected. Specify extensionId" cuando hay múltiples perfiles de Chrome abiertos.
 */
export async function getPlaywriterCdpUrl(options = {}) {
  const port = options.port || 19988;
  const host = options.host || '127.0.0.1';
  try {
    const res = await axios.get(`http://${host}:${port}/extensions/status`, { timeout: 3000 });
    const extensions = res.data.extensions;
    if (extensions && extensions.length > 0) {
      // Priorizar la extensión que tiene páginas/pestañas activas abiertas, o elegir la primera disponible.
      const active = extensions.find(e => e.activeTargets > 0) || extensions[0];
      console.log(`🔌 [Playwriter Helper] Conexión CDP resuelta con extensionId: "${active.extensionId}" (${active.browser || 'Browser desconocido'})`);
      return getCdpUrl({ port, host, extensionId: active.extensionId });
    }
  } catch (err) {
    console.warn(`⚠️ [Playwriter Helper] Falló la consulta de extensiones (${err.message}). Usando fallback sin extensionId.`);
  }
  return getCdpUrl({ port, host });
}
