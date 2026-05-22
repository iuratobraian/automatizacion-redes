import fs from 'fs';
import path from 'path';

// 50 prompts visuales virales, interactivos y premium enfocados en trading y TradeShare
export const promptLibrary = [
  "un toro majestuoso de cristal neón cian y magenta emergiendo imponentemente a través de un gráfico 3D de velas japonesas alcistas, con el texto 'www.trade-share.com' grabado con láser en su costado.",
  "un trader concentrado frente a un escritorio suspendido de cristal futurista, con pantallas holográficas que muestran gráficos de Forex cian y naranja, atmósfera cyberpunk de noche de alta tecnología, y 'www.trade-share.com' flotando en luz de neón.",
  "un tablero de ajedrez futurista donde cada pieza es un gráfico financiero de neón brillante, con el rey siendo un gran gráfico alcista de velas de Forex, estética cian y magenta, y el logo de 'www.trade-share.com' sutilmente de fondo.",
  "una silueta de un trader meditando pacíficamente en medio de una tormenta digital de datos financieros, velas ascendentes cian y magenta iluminando el espacio, con 'www.trade-share.com' flotando elegantemente.",
  "una escalera geométrica de cristal luminosa que asciende hacia un amanecer digital sobre un fondo oscuro de Forex, con tonos neón cian, magenta y oro, reflejando éxito y disciplina, con el texto 'www.trade-share.com' grabado sutilmente.",
  "un lobo futurista esculpido en fibra de carbono y luces de neón cian observando un horizonte digital de rascacielos con gráficos bursátiles de alta fidelidad, con el enlace de 'www.trade-share.com' reflejado en el suelo húmedo.",
  "un casco cyberpunk de trader con visores holográficos que proyectan tendencias de Forex en tiempo real, reflejos cian, magenta y ámbar, y la inscripción 'www.trade-share.com' grabada con láser en el lateral.",
  "un gran engranaje mecánico de neón cian y magenta procesando bloques de velas de Forex brillantes, simbolizando el sistema automatizado sin fricción de TradeShare, con 'www.trade-share.com' en luz brillante.",
  "un majestuoso oso de cristal oscuro con grietas de lava de neón naranja enfrentándose a un toro de neón cian, sobre una arena de gráficos financieros en 3D, con el texto de 'www.trade-share.com' en la esquina.",
  "una laptop transparente flotando en una oficina de noche de alta tecnología con vistas a una metrópolis cyberpunk, mostrando el panel de TradeShare con TradingView integrado en neón cian, y el link 'www.trade-share.com' visible.",
  "un reloj de arena digital donde los granos de arena son velas bursátiles brillantes cian y magenta, simbolizando el valor del tiempo en trading, con 'www.trade-share.com' grabado en la base metálica pulida.",
  "una bitácora digital flotante conectada a MT5 mediante rayos de luz de neón cian, automatizando la carga de trades en tiempo real, atmósfera futurista y limpia, con 'www.trade-share.com' brillante.",
  "un cerebro cibernético brillante compuesto por circuitos de velas financieras y flujos de datos cian y magenta, analizando patrones bursátiles, con 'www.trade-share.com' proyectado en holograma.",
  "dos manos robóticas estrechándose en un acuerdo inteligente en medio de un flujo de gráficos de Forex brillantes, estética cian, magenta y oro, representando la comunidad TradeShare, con 'www.trade-share.com' en neón.",
  "un cohete digital de cristal neón cian rompiendo una resistencia de velas financieras bajistas rojas y convirtiéndolas en una explosión alcista verde, con 'www.trade-share.com' brillando en la estela.",
  "un escritorio de trading futurista al aire libre en la cima de un rascacielos cyberpunk de noche, pantallas de neón cian y magenta, con la luna llena de fondo y el texto de 'www.trade-share.com' sutil.",
  "una brújula holográfica dorada flotando sobre gráficos financieros oscuros con agujas de neón cian señalando el éxito disciplinado, con 'www.trade-share.com' flotando al lado.",
  "un portal dimensional circular de neón cian y magenta que muestra un entorno de trading ordenado libre de estrés y Excel, con 'www.trade-share.com' arqueado sobre el portal.",
  "un chip de silicio dorado pulido con patrones de gráficos bursátiles de neón cian y magenta incrustados en su superficie de alta tecnología, y 'www.trade-share.com' grabado con precisión micrométrica.",
  "una taza de café flotante proyectando una pantalla holográfica interactiva con análisis de psicotrading de TradeShare en neón cian, estética acogedora y ultra moderna de noche, con 'www.trade-share.com'.",
  "un majestuoso fénix neón cian y magenta emergiendo de las cenizas de un gráfico financiero liquidado hacia una tendencia alcista imparable, con 'www.trade-share.com' brillando en sus alas.",
  "un laberinto 3D flotante de datos financieros de neón donde un hilo de luz cian guía hacia el centro con el escudo de TradeShare, y el link 'www.trade-share.com' brillando arriba.",
  "un gran diamante flotando sobre un fondo de gráficos de Forex de neón cian y magenta, reflejando múltiples proyecciones y velas alcistas en sus facetas, con 'www.trade-share.com' grabado en su interior.",
  "un casco de astronauta reflejando en su visor de oro una consola de trading futurista de TradeShare con gráficos de neón cian de Forex, espacio profundo de fondo y 'www.trade-share.com'.",
  "un telescopio holográfico gigante apuntando hacia constelaciones que forman gráficos financieros alcistas en el cielo estrellado cyberpunk, con 'www.trade-share.com' brillando en luz de neón cian.",
  "una gran llave digital de cristal neón cian y magenta abriendo una bóveda flotante llena de gráficos y herramientas financieras premium de TradeShare, con 'www.trade-share.com' en la llave.",
  "un faro holográfico en una costa digital de noche emitiendo un potente rayo de luz de neón cian sobre un océano de gráficos bursátiles turbulentos, con 'www.trade-share.com' en la base.",
  "un árbol digital de fibra óptica cuyas hojas son velas financieras cian y magenta brillantes y las raíces son líneas de datos de MT5, con 'www.trade-share.com' proyectado en el tronco.",
  "un escudo medieval holográfico de cristal neón cian protegiendo un gráfico financiero de flechas rojas bajistas, representando gestión de riesgo premium, con 'www.trade-share.com' grabado en el centro.",
  "un escritorio de trading cyberpunk integrado en el tablero de un auto deportivo futurista volando sobre una megaciudad de noche, pantallas de neón cian y magenta, con 'www.trade-share.com'.",
  "un trader cibernético con tatuajes de circuitos de neón cian y magenta operando de forma relajada en una playa digital futurista al atardecer, pantallas flotantes, con 'www.trade-share.com'.",
  "un tablero arcade retro-futurista con gráficos financieros en estilo de 8 bits de neón brillante, pantalla de juego de TradeShare, y el texto 'www.trade-share.com' en la marquesina superior.",
  "un gran libro antiguo holográfico abierto que revela páginas de luz flotante con gráficos financieros y análisis de IA cian y magenta, con 'www.trade-share.com' como firma de oro.",
  "una pirámide de cristal neón flotando sobre un mar de datos financieros oscuros, con un rayo de luz cian ascendente desde su cúspide, y el texto de 'www.trade-share.com' grabado en su base.",
  "un casco cyberpunk con visores cian y magenta mostrando la bitácora automatizada de TradeShare y estadísticas de rendimiento comercial en tiempo real, con 'www.trade-share.com' visible.",
  "un león majestuoso esculpido en cristal digital cian y naranja observando un gráfico de velas de Forex alcista, simbolizando fuerza y paciencia, con 'www.trade-share.com' brillando abajo.",
  "un mapa del tesoro holográfico proyectando islas que son plataformas de trading y rutas comerciales en neón cian y magenta, con 'www.trade-share.com' en el marcador del tesoro.",
  "una espada digital de luz de neón cian clavada en una roca de cristal con gráficos de velas de Forex bajistas cruzándola, estética premium cyberpunk, con 'www.trade-share.com' grabado.",
  "un trader futurista en una cabina de pilotaje de una nave espacial de trading, pantallas táctiles cian y magenta con gráficos financieros complejos, espacio exterior de fondo y 'www.trade-share.com'.",
  "un reloj inteligente holográfico flotando en la muñeca de un trader, proyectando alertas de psicotrading y metas de consistencia en neón cian, con 'www.trade-share.com' en la interfaz.",
  "un majestuoso águila neón cian y magenta volando sobre gráficos de Forex tridimensionales de alta fidelidad tecnológica, con 'www.trade-share.com' grabado con luz en su pecho.",
  "una bitácora de trading holográfica flotando en el aire y sincronizándose mediante hilos de luz dorados con un gráfico de MT5 en una oficina futurista, con 'www.trade-share.com' destacado.",
  "un cubículo de trading minimalista de noche rodeado por una cascada digital de datos financieros de neón cian y magenta descendiendo del techo, con 'www.trade-share.com' brillando en el suelo.",
  "un toro cibernético de cromo pulido con ojos de neón cian rompiendo una pared de cristal llena de velas bursátiles bajistas hacia el éxito, con 'www.trade-share.com' grabado en la pared.",
  "una red neuronal holográfica brillante conectando múltiples perfiles de traders y comunidades en un gran ecosistema cian y magenta, con el logo de 'www.trade-share.com' en el centro.",
  "un escritorio de trading cyberpunk minimalista flotando pacíficamente sobre un mar de nubes digitales rosadas y cian al amanecer, pantallas de neón limpias y 'www.trade-share.com'.",
  "una mano holográfica dibujando una línea de tendencia alcista brillante de neón cian sobre un fondo oscuro de gráficos bursátiles tridimensionales, con 'www.trade-share.com' al final de la línea.",
  "un gran engranaje de cristal cian y magenta rotando en perfecta armonía con relojes y velas financieras flotantes de alta fidelidad tecnológica, y 'www.trade-share.com' en el centro.",
  "un casco holográfico de realidad virtual flotando sobre un escritorio futurista de madera oscura, proyectando un entorno interactivo de trading de TradeShare, con 'www.trade-share.com'.",
  "un amanecer espectacular sobre un valle digital de gráficos financieros de neón cian y magenta, con una silueta de trader observando la consistencia del horizonte, con 'www.trade-share.com'."
];

// Obtener y rotar el prompt seleccionado para evitar repeticiones
export function getRotatingPrompt() {
  const statePath = path.join(process.cwd(), '.agent', 'prompt_rotation_state.json');
  let currentIndex = 0;
  
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      currentIndex = (state.index + 1) % promptLibrary.length;
    } catch (e) {
      currentIndex = Math.floor(Math.random() * promptLibrary.length);
    }
  } else {
    currentIndex = Math.floor(Math.random() * promptLibrary.length);
  }
  
  // Guardar el nuevo índice
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ index: currentIndex }, null, 2), 'utf8');
  } catch (e) {}
  
  return promptLibrary[currentIndex];
}
