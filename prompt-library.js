import fs from 'fs';
import path from 'path';

// 50 prompts visuales virales, interactivos y premium enfocados en trading y TradeShare
export const promptLibrary = [
  "Un primer plano premium e hiperrealista de una laptop moderna sobre un escritorio de madera, mostrando un gráfico detallado de velas alcistas en TradingView, con una taza de café de cerámica humeante al lado y el texto 'trade-share.com' grabado con láser de forma muy sutil en la esquina inferior del escritorio.",
  "Un trader profesional concentrado trabajando de noche en su oficina en casa, iluminación cálida indirecta, pantallas mostrando gráficos de análisis técnico limpios, libreta de cuero abierta sobre el escritorio con anotaciones manuscritas, y 'trade-share.com' impreso discretamente en la base de la libreta.",
  "Una trader mujer analizando el mercado financiero de forma relajada y segura en su laptop, sentada en un moderno y elegante espacio de coworking con grandes ventanales, luz natural del sol de la tarde, taza de té al lado, estética premium y realista, con 'trade-share.com' en la pantalla de su tablet.",
  "Plano detalle de manos de un trader anotando en una agenda física de cuero junto a un teclado minimalista y un mouse, con un gráfico de Forex iluminado suavemente al fondo, estética sumamente limpia, profesional y acogedora, y el enlace 'trade-share.com' impreso sutilmente en la parte inferior de la página de la agenda.",
  "Un escritorio minimalista de trading a la luz del día, una libreta de cuero, una taza de café espresso, una planta pequeña y un monitor ultra-wide que muestra un gráfico bursátil impecable sin indicadores ruidosos, reflejo limpio de luz de ventana, con el logo 'trade-share.com' al pie de la pantalla.",
  "Un trader de perfil sonriendo relajadamente frente a sus gráficos al finalizar una sesión exitosa, ambiente hogareño con estanterías de libros de fondo, luz suave y cálida, mostrando una atmósfera real y humana libre de estrés, con 'trade-share.com' de fondo.",
  "Primer plano de una tablet recostada sobre una mesa de café rústica en una cafetería urbana, mostrando el dashboard y bitácora automatizada de TradeShare, una taza de café latte con arte, desenfoque de fondo bokeh suave con personas reales charlando, y la inscripción 'trade-share.com' grabada sutilmente en la madera de la mesa.",
  "Una trader concentrada usando anteojos, con expresión de calma y disciplina, analizando patrones de velas japonesas en múltiples pantallas en su estudio personal, luz natural acogedora y ordenada, y 'trade-share.com' escrito con tiza en una pequeña pizarra de notas de fondo.",
  "Un setup de trading de alta gama en un departamento de ciudad por la tarde, luz de atardecer entrando por la ventana, escritorio ordenado con laptop, tablet, taza de café metálica y una agenda física de trading, con 'trade-share.com' sutilmente visible en la tapa de la agenda.",
  "Plano detalle de un gráfico de TradingView detallado en la pantalla de una laptop premium, con una mano humana operando el mouse con precisión, luz cálida de una lámpara de escritorio, libre de elementos artificiales o fantásticos, con 'trade-share.com' en la barra de direcciones del navegador.",
  "Un trader profesional maduro analizando calmadamente una racha en su bitácora digital de TradeShare, anotando ideas de disciplina en su diario físico, taza de café clásica, ambiente de biblioteca de estudio con luz de lectura muy acogedora, con 'trade-share.com' en el margen de su diario.",
  "Un espacio de trading ordenado en casa: escritorio de madera de roble, una laptop de última generación con gráficos financieros de alta definición, un termo de café premium, luz suave e indirecta de fondo, atmósfera de enfoque total y paz mental, con 'trade-share.com' sutilmente grabado en la madera.",
  "Una videollamada interactiva en una laptop donde un mentor de trading real explica la estructura de mercado a su comunidad de alumnos de forma muy didáctica y humana, tazas de café sobre la mesa, con el logo de 'trade-share.com' en la esquina de la interfaz.",
  "Un plano de arriba hacia abajo (flatlay) de un escritorio de trader súper estético y realista: laptop con gráfico alcista verde, taza de espresso, anteojos de lectura, pluma estilográfica y una libreta de notas con la frase grabada 'trade-share.com'.",
  "Un trader joven y enfocado analizando pacientemente gráficos de mercado en su laptop en la barra de un café de especialidad luminoso, taza de flat white al lado, luz natural de mañana, ambiente urbano realista, con 'trade-share.com' sutilmente visible en la laptop.",
  "Dos traders socios (hombre y mujer) discutiendo ideas frente a una pantalla gigante con gráficos financieros detallados en una oficina corporativa moderna, tazas de café en la mano, actitud colaborativa y profesional, con el enlace 'trade-share.com' en la barra superior de la pantalla.",
  "Una tablet flotando en un soporte de escritorio junto a una laptop principal, mostrando el dashboard y estadísticas de rendimiento real del trader en TradeShare, luz de lectura cálida, ambiente relajado e inteligente de noche, y 'trade-share.com' impreso sutilmente.",
  "Plano detalle de un reloj de pulsera clásico de trader junto a un teclado mecánico elegante y una taza de café negro, reflejo de gráficos alcistas en el vidrio de la mesa, atmósfera sumamente profesional and realista, con la firma de 'trade-share.com'.",
  "Una trader mujer sonriendo complacida mientras cierra su laptop después de cumplir sus reglas diarias de trading, taza de té humeante, estudio en casa con plantas reales y luz solar acogedora de la tarde, y el enlace 'trade-share.com' visible de fondo.",
  "Un espacio de estudio de trading minimalista de noche: luz cálida indirecta detrás del monitor principal, cuaderno de apuntes con anotaciones claras de drawdown, taza de café térmica y 'trade-share.com' grabado discretamente en la base de la pantalla.",
  "Un trader joven trabajando con concentración desde la mesa de su balcón al atardecer, laptop mostrando gráficos de divisas, una taza de café al lado, ciudad real de fondo con luces suaves difuminadas, ambiente pacífico y libre, con 'trade-share.com'.",
  "Un primer plano de una taza de café humeante y un lápiz sobre un plan de trading impreso en papel de alta calidad, con la laptop al fondo mostrando gráficos alcistas en TradingView, estética orgánica e hiperrealista, con 'trade-share.com' impreso en la cabecera del plan.",
  "Una trader analizando el mercado financiero en un ipad pro con lápiz óptico, sentada cómodamente en un sillón orejero de cuero junto a una ventana un día lluvioso, luz tenue acogedora, café caliente al lado, con la marca de 'trade-share.com' en la esquina de la tablet.",
  "Un escritorio de trading rústico e impecable: madera recuperada, monitor con gráficos detallados de Forex de alta definición, libreta de notas física para registrar emociones de psicotrading, luz natural suave, y 'trade-share.com' grabado con elegancia.",
  "Un trader anotando métricas en su diario de consistencia al lado de su laptop en una biblioteca universitaria o de estudio silenciosa, luz suave de lámpara verde clásica, ambiente analítico, consistente y disciplinado, con 'trade-share.com'.",
  "Un plano macro de una pluma estilográfica escribiendo reglas de gestión de riesgo sobre un diario de cuero, con la pantalla de una laptop mostrando gráficos alcistas al fondo desdibujado, estética extremadamente premium, y 'trade-share.com' en la libreta.",
  "Una trader mujer en su oficina compartiendo ideas de forma muy expresiva y profesional con un colega, rodeados de gráficos reales en pizarras de vidrio y pantallas, luz natural de mañana, con la inscripción 'trade-share.com' en la esquina de la pizarra.",
  "Un setup de trading de noche hiperrealista y estético: monitor principal mostrando TradingView con velas japonesas, taza de café de diseño, teclado inalámbrico, luz ambiental ámbar muy acogedora y 'trade-share.com' en la esquina inferior.",
  "Un trader profesional maduro cerrando su agenda de cuero con satisfacción al mediodía tras operar una sola killzone horaria de forma sumamente disciplinada, taza de café vacía al lado, oficina moderna, con 'trade-share.com' sutil.",
];

// 30+ Temas de trading hiper-específicos, realistas y centrados en el ecosistema TradeShare
export const tradingTopics = [
  {
    tema: "Disciplina y Plan de Trading sin Humo",
    desc: "la importancia crucial de seguir las reglas predefinidas del trading, esperar pacientemente a que se cumplan las confluencias de tu estrategia antes de operar, evitar el overtrading irracional, y entender que la paciencia paga con creces en lugar de perseguir cada vela."
  },
  {
    tema: "Gestión de Riesgo y Costos Operativos",
    desc: "proteger el capital a toda costa, utilizar stop loss técnico e inamovible, entender la relación riesgo-beneficio (mínimo 1:2), y asimilar que una pérdida es simplemente un costo operativo necesario de este negocio."
  },
  {
    tema: "Control del FOMO y Euforia en Redes",
    desc: "superar la avaricia ciega y el miedo paralizante de quedarse fuera del movimiento (FOMO), mantener la calma y la mente totalmente fría tanto en las rachas ganadoras como en los días de pérdidas consecutivas."
  },
  {
    tema: "El Ecosistema Unificado de TradeShare",
    desc: "dejar de saltar entre Discord, Zoom, planillas Excel aburridas y Drive. Centralizar todo el trading en una sola plataforma profesional con bitácora, TV en vivo y comunidades integradas."
  },
  {
    tema: "Bitácora de Trading Automatizada",
    desc: "por qué registrar tus trades a mano en un Excel anticuado te quita enfoque mental. La bitácora en la nube de TradeShare sincronizada con MT5 te automatiza el registro para que analices tu consistencia con datos reales."
  },
  {
    tema: "Bitácora Premium Conectada a MT5 con Análisis de IA",
    desc: "deja de registrar tus operaciones a mano en planillas estáticas. La bitácora automatizada de TradeShare se sincroniza directamente con tu terminal MT5 y utiliza Inteligencia Artificial para auditar tus sesgos y mejorar tu consistencia."
  },
  {
    tema: "Control de Drawdown y Resiliencia Mental",
    desc: "aprender a convivir con las rachas de pérdidas inevitables, documentarlas rigurosamente para detectar fallas operativas con nuestra IA y no intentar vengarse del mercado tras una mala sesión."
  },
  {
    tema: "Monetización para Líderes y Academias",
    desc: "cómo los formadores de trading rentabilizan su marca creando comunidades premium con sistemas de pago recurrente sencillos, salas privadas 1 a 1 y métricas de consistencia real de sus alumnos."
  },
  {
    tema: "La Mentira del 100% de Efectividad (Winrate)",
    desc: "por qué obsesionarse con no perder nunca es una trampa mortal. Los traders consistentemente rentables a menudo ganan solo el 40% de sus operaciones pero ganan mucho más de lo que pierden gracias a una gestión de riesgo magistral."
  },
  {
    tema: "Psicotrading y Control de Pulsaciones",
    desc: "desarrollar la paciencia aburrida del trader profesional. Aprender a apagar las pantallas una vez completado tu plan diario, protegiendo tu paz mental y tu capital."
  },
  {
    tema: "Backtesting Estadístico Riguroso",
    desc: "validar tu estrategia en el pasado con datos fríos antes de arriesgar un solo dólar en real. El backtesting te da la confianza estadística para ejecutar sin vacilar en los momentos clave."
  },
  {
    tema: "Trading como Negocio vs Casino",
    desc: "tratar la operativa en mercados como una empresa seria. El plan de trading es tu plan de negocios; las pérdidas son tus gastos fijos; la bitácora es tu balance contable mensual."
  },
  {
    tema: "Estructura de Mercado vs Indicadores Retail",
    desc: "la diferencia crítica entre operar con medias móviles atrasadas y entender el flujo institucional, la estructura real (SMC), los order blocks y las zonas de liquidez."
  },
  {
    tema: "Cuentas de Fondeo y Cuidado de Reglas",
    desc: "cómo superar evaluaciones de fondeo con disciplina en el daily drawdown, consistencia estadística en los setups y la bitácora limpia que exigen los inversores profesionales."
  },
  {
    tema: "Auditoría de Trading Personalizada con IA",
    desc: "cómo la inteligencia artificial de TradeShare analiza tu historial de operaciones cargado para darte un diagnóstico directo de qué sesgos psicológicos y qué horarios están arruinando tu rentabilidad."
  },
  {
    tema: "Salas de Trading en Vivo sin Delay",
    desc: "compartir pantallas de análisis y operaciones en tiempo real con alumnos dentro de TradeShare, con chat global integrado y sin depender de plataformas externas lentas."
  },
  {
    tema: "Psicología de la Racha Ganadora",
    desc: "el sutil peligro del exceso de confianza tras varios días de ganancias (overconfidence bias). La importancia de no aumentar los lotajes impulsivamente y apegarse rígidamente al plan original."
  },
  {
    tema: "Londres vs Nueva York: El Foco Horario",
    desc: "entender cuándo se inyecta la liquidez masiva en el mercado y concentrar tus energías operativas solo en las killzones específicas, en lugar de pasar 10 horas frente a los gráficos."
  },
  {
    tema: "Liquidez y Trampas de Mercado (Stop Hunts)",
    desc: "aprender a identificar dónde se acumulan los stop loss de la masa de traders minoristas para no convertirte en la contrapartida de las grandes instituciones."
  },
  {
    tema: "Gestión de Posiciones Activas",
    desc: "el arte de tomar parciales estratégicos y asegurar ganancias moviendo tu posición a Break Even cuando el mercado te da la razón, minimizando el riesgo de retroceso completo."
  },
  {
    tema: "El Silencio y la Inacción Rentable",
    desc: "saber que 'no operar también es operar'. La disciplina de mantenerse al margen cuando el mercado está ruidoso, consolidado o carece de una ventaja clara según tus confluencias."
  },
  {
    tema: "El Diario Emocional del Trader",
    desc: "registrar no solo los números del trade, sino cómo te sentías físicamente al tomarlo (ansioso, confiado, cansado) para identificar sesgos del psicotrading que destruyen tu rentabilidad."
  },
  {
    tema: "El Interés Compuesto Sostenible",
    desc: "enfocarse en el crecimiento orgánico a largo plazo de tus cuentas, en lugar de intentar duplicar el capital en una sola semana arriesgando lotajes suicidas."
  },
  {
    tema: "Análisis Multi-timeframe de Alta Precisión",
    desc: "mapear la dirección macro del mercado en temporalidades mayores (H4/D1) antes de refinar entradas de alta precisión en temporalidades menores (M5/M15)."
  },
  {
    tema: "La Soledad del Trader y el Chat Global",
    desc: "cómo compartir ideas de trading con otros traders disciplinados en el chat global de TradeShare te mantiene enfocado y evita el aislamiento mental del trading en las sombras."
  },
  {
    tema: "Gestión del Drawdown Máximo en Cuentas",
    desc: "el plan de contingencia obligatorio: reducir a la mitad tu riesgo habitual de operación cuando tu cuenta entra en un drawdown del 3% o 4%, hasta recuperar la racha ganadora."
  },
  {
    tema: "Auditoría de Sesión Semanal",
    desc: "la rutina de los fines de semana: revisar cada entrada anotada en TradeShare los sábados con calma para ver si ejecutaste por plan o por impulso emocional."
  },
  {
    tema: "Soporte e Integración con Exness",
    desc: "operar con partners regulados e integrar las métricas operativas directamente a TradeShare para dar transparencia absoluta a tu comunidad de seguidores."
  },
  {
    tema: "Evitar la Parálisis por Análisis",
    desc: "por qué llenar tu pantalla con 15 indicadores diferentes te paraliza al tomar decisiones. El valor de un gráfico limpio centrado únicamente en el precio y la liquidez."
  },
  {
    tema: "La Mentalidad del Trader de Élite",
    desc: "comprender que el trading rentable no es emocionante; es aburrido, repetitivo y sumamente técnico. El éxito es el resultado de la disciplina diaria, no de la suerte."
  }
];

// 8+ Enfoques Narrativos Creativos para romper la monotonía del copy generado
export const narrativeAngles = [
  {
    tipo: "Storytelling (Anécdota Corta)",
    instruccion: "Comienza contando una anécdota o historia muy real y corta de un trader ficticio (o real) que sufrió pérdidas por ignorar este pilar o que logró el éxito tras entenderlo. Fluye de forma natural a una enseñanza concreta."
  },
  {
    tipo: "Crítica al Humo y Gurús de Lamborghinis",
    instruccion: "Adopta un tono crudo, súper directo y antipático hacia el humo de las redes sociales, los gurús y falsas promesas de dinero fácil. Habla sobre la realidad aburrida pero rentable de hacer trading serio y disciplinado en TradeShare."
  },
  {
    tipo: "Hack Técnico y Educativo",
    instruccion: "Adopta la perspectiva de un mentor técnico de élite. Explica paso a paso, con viñetas claras, un consejo técnico o táctica aplicable inmediatamente en los gráficos respecto a este tema."
  },
  {
    tipo: "Empatía Total con el Dolor del Trader Frustrado",
    instruccion: "Comienza atacando con precisión el dolor o la frustración exacta que siente el trader en este escenario (el nudo en el estómago al perder, la culpa del overtrading, la fatiga digital) y explícale con empatía cómo TradeShare le da paz mental."
  },
  {
    tipo: "Enfoque en Eficiencia de Herramientas y Productividad",
    instruccion: "Enfócate en cómo la tecnología moderna (como centralizar todo en TradeShare) ahorra tiempo y esfuerzo administrativo inútil (como las planillas Excel o saltar entre 5 apps), permitiendo al trader concentrarse en el gráfico."
  },
  {
    tipo: "Debate y Pregunta Provocativa",
    instruccion: "Abre con una declaración controvertida o una pregunta directa sobre la industria del trading para sacudir a la comunidad y generar discusión en los comentarios."
  },
  {
    tipo: "Psicotrading y Enfoque Mental Zen",
    instruccion: "Concéntrate al 100% en la psicología del trading, el manejo de las pulsaciones elevadas, el descanso correcto y cómo apagar la pantalla a tiempo es la operación más rentable del día."
  },
  {
    tipo: "Expectativa vs Realidad del Trading",
    instruccion: "Haz una comparativa cruda pero divertida de lo que el público masivo cree que es el trading (Lamborghinis, yates, emoción diaria) versus lo que realmente es (disciplina aburrida, registrar datos, gestión fría de riesgo)."
  }
];

// Obtener y rotar el prompt de imagen seleccionado para evitar repeticiones
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
  
  const basePrompt = promptLibrary[currentIndex];
  
  // Listas de variaciones visuales para dinamizar y evitar duplicidad
  const deskMaterials = [
    "madera de roble oscuro con vetas marcadas",
    "mármol blanco italiano de Carrara",
    "vidrio templado ahumado minimalista",
    "madera de nogal pulida de alta gama",
    "concreto industrial gris pulido",
    "madera rústica recuperada texturizada"
  ];
  
  const lightings = [
    "luz cálida del atardecer filtrándose por grandes ventanales",
    "iluminación matutina limpia y natural de mañana",
    "luz ambiental ámbar indirecta y muy acogedora",
    "iluminación focalizada de lámpara de escritorio LED moderna",
    "luz suave y difusa de un día templado",
    "luz dorada de hora mágica acariciando la superficie"
  ];
  
  const accessories = [
    "una taza de café de cerámica negra humeante",
    "un vaso térmico premium plateado",
    "auriculares de diadema inalámbricos reposando al lado",
    "una maceta minimalista con una suculenta verde",
    "anteojos de lectura con marco metálico fino",
    "una pluma estilográfica de tinta negra abierta"
  ];
  
  const brands = [
    "con la URL 'trade-share.com' grabada sutilmente en una libreta de cuero",
    "mostrando un elegante detalle con la inscripción 'trade-share.com'",
    "con el enlace 'trade-share.com' grabado con láser de forma discreta",
    "con una pequeña pizarra al fondo que menciona de reojo 'trade-share.com'"
  ];

  // Elegir aleatoriamente uno de cada uno
  const mat = deskMaterials[Math.floor(Math.random() * deskMaterials.length)];
  const light = lightings[Math.floor(Math.random() * lightings.length)];
  const acc = accessories[Math.floor(Math.random() * accessories.length)];
  const brand = brands[Math.floor(Math.random() * brands.length)];

  // Retornar un prompt enriquecido y dinámico
  return `${basePrompt} En el entorno de la escena, se observa una mesa de ${mat}, bajo una ${light}. Cerca de los dispositivos hay ${acc}, ${brand}. Estética hiperrealista premium de fotografía profesional de alta gama.`;
}

// Obtener y rotar secuencialmente un tema + ángulo narrativo para asegurar frescura infinita
export function getRotatingTopicAndAngle() {
  const statePath = path.join(process.cwd(), '.agent', 'content_rotation_state.json');
  let topicIndex = 0;
  let angleIndex = 0;

  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      topicIndex = (state.topicIndex + 1) % tradingTopics.length;
      angleIndex = (state.angleIndex + 1) % narrativeAngles.length;
    } catch (e) {
      topicIndex = Math.floor(Math.random() * tradingTopics.length);
      angleIndex = Math.floor(Math.random() * narrativeAngles.length);
    }
  } else {
    topicIndex = Math.floor(Math.random() * tradingTopics.length);
    angleIndex = Math.floor(Math.random() * narrativeAngles.length);
  }

  // Guardar el estado actual de rotación
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ topicIndex, angleIndex }, null, 2), 'utf8');
  } catch (e) {}

  return {
    topic: tradingTopics[topicIndex],
    angle: narrativeAngles[angleIndex]
  };
}

export const promptLibraryCaptions = [
  "La consistencia no es un trade de suerte, es disciplina. ¡Y ahora en TradeShare es totalmente GRATIS! 🚀 Registrate, creá tu comunidad y usá la Bitácora Pro sin pagar un centavo. Entrá en trade-share.com y empezá a competir de verdad. 📈☕ #Trading #Consistencia #TradeShareGratis",
  "Operar de noche requiere enfoque. En TradeShare te damos las herramientas profesionales GRATIS para que audites tu trading con IA. Conectá tu MT5 y usá la Bitácora Pro gratis en trade-share.com. 🌙✍️ #Psicotrading #Metricas #TradeShare",
  "El trading zen es posible cuando tenés las herramientas correctas. TradeShare es ahora 100% GRATIS para todos. Creá tu comunidad, registrate y usá la Bitácora Pro en trade-share.com. ¡Sumate a la revolución! ☀️🍵 #TradingZen #TradeShareGratis",
  "Tu diario emocional es tu mejor aliado. En TradeShare, la Bitácora Pro y la creación de comunidades son GRATUITAS. No más excusas para no ser profesional. Entrá a trade-share.com 📔⌨️ #Psicotrading #SmartMoney #FreeTrading",
  "Un espacio limpio, una mente clara y herramientas GRATIS. En TradeShare tenés todo: bitácora, comunidades y streaming sin costo. Registrate en trade-share.com y dominá el mercado. 🌿💻 #MinimalistTrading #Forex #TradeShare",
  "¿Respetaste tu plan hoy? Mostrá tu consistencia real con la Bitácora Pro de TradeShare, ahora GRATIS para todos. Creá tu propia comunidad sin costos en trade-share.com. 📚✨ #TradingReal #Discipline #TradeShare",
  "Tu trading es un negocio, y TradeShare es tu socio GRATUITO. Bitácora Pro conectada a MT5 y gestión de comunidades 100% gratis. Empezá hoy en trade-share.com ☕📊 #Business #TradeShareGratis",
  "¿Winrate del 40%? Es suficiente si tenés gestión. Auditá tus números GRATIS con la Bitácora Pro de TradeShare. Registrate y creá tu comunidad en trade-share.com 👓🎯 #EducacionFinanciera #RiskManagement #TradeShare",
  "Libertad de tiempo y paz mental con herramientas profesionales GRATIS. TradeShare es totalmente gratuito: Bitácora Pro, registro y comunidades. Unite en trade-share.com 🌇☕ #TradingLife #LibertadFinanciera #TradeShare",
  "Simplificá tu análisis. Usá TradeShare para trackear todo GRATIS. Bitácora Pro y comunidades sin costo en trade-share.com. Vamos a competir con los mejores. 💻🎯 #PriceAction #SMC #TradeShare",
  "Aceptá el drawdown y mejorá con IA. El auditor de TradeShare es GRATIS. Bitácora Pro y comunidades para todos en trade-share.com. ¡Sumate ya! 📖☕ #Resiliencia #Mindset #TradeShareGratis",
  "Tu plan es tu ley. TradeShare es tu herramienta GRATUITA para cumplirla. Bitácora Pro y creación de comunidades sin cargo en trade-share.com 💻🛡️ #DisciplineWins #Rules #TradeShare",
  "Aprendé en comunidad GRATIS. En TradeShare podés crear tu propio espacio o unirte a otros sin pagar nada. Usá la Bitácora Pro gratis en trade-share.com 🎙️📈 #Mentoria #ComunidadTrading #TradeShare",
  "Preparación + Oportunidad + Herramientas GRATIS = Éxito. Usá la Bitácora Pro de TradeShare sin costo. Registrate en trade-share.com y empezá a ganar. ☕🖊️ #EstiloDeVida #Consistencia #TradeShare",
  "Trading en cualquier lugar con tecnología GRATUITA. TradeShare es 100% gratis: comunidades, registro y Bitácora Pro. Entrá en trade-share.com ☕📲 #DigitalNomad #Tech #TradeShare",
  "Colaboración profesional sin barreras. En TradeShare crear tu comunidad es GRATIS. Bitácora Pro y streaming sin costo en trade-share.com 🏢📊 #TradingPartners #TradeShareGratis",
  "Lo que no se mide, no mejora. Medilo TODO GRATIS en TradeShare. Bitácora Pro automatizada y comunidades sin costo en trade-share.com 📊🛡️ #IA #TradingMetrics #TradeShare",
  "Operá en las killzones y registrá todo GRATIS en TradeShare. Bitácora Pro y comunidades profesionales sin cargo. Entrá en trade-share.com ⏱️⌨️ #TimeIsMoney #Killzone #TradeShare",
  "La operación más rentable es saber cuándo parar. Registrá tu disciplina GRATIS en TradeShare. Bitácora Pro y comunidades en trade-share.com ☀️🍵 #Psicotrading #PazMental #TradeShare",
  "Pasión, tecnología y todo GRATIS. TradeShare te da la Bitácora Pro y comunidades sin costo. Registrate en trade-share.com y vamos a competir. 🌌💻 #WorkHard #Focus #TradeShareGratis",
  "Operar al aire libre, mantené la calma y usá herramientas GRATIS. TradeShare: Bitácora Pro y comunidades 100% gratuitas en trade-share.com 🌇💻 #TradingMotivation #TradeShare",
  "Tratá el trading como un negocio serio con herramientas GRATUITAS. Bitácora Pro y comunidades en TradeShare. Unite en trade-share.com ☕📄 #ProfessionalTrading #TradeShareGratis",
  "Paciencia en mercados lentos. Registrá tu espera GRATIS en TradeShare. Bitácora Pro y comunidades sin costo en trade-share.com 🌧️📲 #Patience #TradeShare",
  "Gráficos limpios y Bitácora Pro GRATIS. En TradeShare podés crear tu comunidad y auditar tu trading sin costo. Entrá en trade-share.com 🪵📊 #SmartMoney #InstitutionalTrading #TradeShare",
  "Estudio riguroso con herramientas GRATIS. TradeShare te regala la Bitácora Pro y la creación de comunidades. Registrate en trade-share.com 📚⏱️ #Consistency #TradeShareGratis",
  "Gestión de riesgo matemática GRATIS. Usá la Bitácora Pro de TradeShare sin pagar nada. Creá tu comunidad en trade-share.com 🖋️🛡️ #RiskManagement #TradeShare",
  "Transparencia total GRATIS. En TradeShare las comunidades y la Bitácora Pro no tienen costo. Unite a la revolución en trade-share.com 🏢🎙️ #TradingAcademy #TradeShareGratis",
  "Ecosistema integrado y 100% GRATUITO. Bitácora Pro, comunidades y registro sin costo en TradeShare. Entrá en trade-share.com 🌌💻 #TradingPremium #TradeShare",
  "Disciplina en cada killzone. Registrá tu consistencia GRATIS en TradeShare. Bitácora Pro y comunidades en trade-share.com ⏱️📔 #Disciplina #Focus #TradeShare",
  "Automatización total GRATIS. Sincronizá MT5 con TradeShare y usá la Bitácora Pro sin cargo. Creá tu comunidad en trade-share.com 💻🚀 #TradingAutomation #TradeShareGratis",
  "Claridad absoluta y herramientas GRATUITAS. Bitácora Pro y comunidades en TradeShare. Vamos a competir en trade-share.com 📱📊 #CleanCharts #TradeShare",
  "Paciencia aburrida, resultados profesionales y todo GRATIS. Usá TradeShare: Bitácora Pro y comunidades en trade-share.com 📖☕ #PatiencePays #TradeShareGratis",
  "Fundamentales sin ruido y registro GRATIS. TradeShare te da la Bitácora Pro y comunidades sin costo. Entrá en trade-share.com 📰☕ #Macroeconomics #TradeShare",
  "Planificación nocturna y herramientas GRATUITAS. Bitácora Pro y comunidades en TradeShare. Registrate en trade-share.com 🌌⌨️ #Preparation #TradeShareGratis",
  "Transparencia para tus inversores GRATIS. Muestra tus métricas con la Bitácora Pro de TradeShare sin costo. Unite en trade-share.com 🏢🛡️ #FundManager #TradeShare"
];

export function getCaptionForPrompt(promptText, index) {
  if (typeof index === 'number' && index >= 0) {
    return promptLibraryCaptions[index % promptLibraryCaptions.length];
  }
  
  if (typeof promptText === 'string') {
    // Buscar coincidencia exacta o parcial en promptLibrary
    const idx = promptLibrary.findIndex(p => p.toLowerCase() === promptText.toLowerCase() || promptText.toLowerCase().includes(p.toLowerCase()));
    if (idx !== -1) {
      return promptLibraryCaptions[idx];
    }
    
    // Hash simple de la string del prompt para seleccionar de forma determinista
    let hash = 0;
    for (let i = 0; i < promptText.length; i++) {
      hash = (hash << 5) - hash + promptText.charCodeAt(i);
      hash |= 0;
    }
    return promptLibraryCaptions[Math.abs(hash) % promptLibraryCaptions.length];
  }
  
  return promptLibraryCaptions[Math.floor(Math.random() * promptLibraryCaptions.length)];
}
