import fs from 'fs';
import path from 'path';

// 50 prompts visuales virales, interactivos y premium enfocados en trading y TradeShare
export const promptLibrary = [
  "Un primer plano premium e hiperrealista de una laptop moderna sobre un escritorio de madera, mostrando un gráfico detallado de velas alcistas en TradingView, con una taza de café de cerámica humeante al lado y el texto 'www.trade-share.com' grabado con láser de forma muy sutil en la esquina inferior del escritorio.",
  "Un trader profesional concentrado trabajando de noche en su oficina en casa, iluminación cálida indirecta, pantallas mostrando gráficos de análisis técnico limpios, libreta de cuero abierta sobre el escritorio con anotaciones manuscritas, y 'www.trade-share.com' impreso discretamente en la base de la libreta.",
  "Una trader mujer analizando el mercado financiero de forma relajada y segura en su laptop, sentada en un moderno y elegante espacio de coworking con grandes ventanales, luz natural del sol de la tarde, taza de té al lado, estética premium y realista, con 'www.trade-share.com' en la pantalla de su tablet.",
  "Plano detalle de manos de un trader anotando en una agenda física de cuero junto a un teclado minimalista y un mouse, con un gráfico de Forex iluminado suavemente al fondo, estética sumamente limpia, profesional y acogedora, y el enlace 'www.trade-share.com' impreso sutilmente en la parte inferior de la página de la agenda.",
  "Un escritorio minimalista de trading a la luz del día, una libreta de cuero, una taza de café espresso, una planta pequeña y un monitor ultra-wide que muestra un gráfico bursátil impecable sin indicadores ruidosos, reflejo limpio de luz de ventana, con el logo 'www.trade-share.com' al pie de la pantalla.",
  "Un trader de perfil sonriendo relajadamente frente a sus gráficos al finalizar una sesión exitosa, ambiente hogareño con estanterías de libros de fondo, luz suave y cálida, mostrando una atmósfera real y humana libre de estrés, con 'www.trade-share.com' de fondo.",
  "Primer plano de una tablet recostada sobre una mesa de café rústica en una cafetería urbana, mostrando el dashboard y bitácora automatizada de TradeShare, una taza de café latte con arte, desenfoque de fondo bokeh suave con personas reales charlando, y la inscripción 'www.trade-share.com' grabada sutilmente en la madera de la mesa.",
  "Una trader concentrada usando anteojos, con expresión de calma y disciplina, analizando patrones de velas japonesas en múltiples pantallas en su estudio personal, luz natural acogedora y ordenada, y 'www.trade-share.com' escrito con tiza en una pequeña pizarra de notas de fondo.",
  "Un setup de trading de alta gama en un departamento de ciudad por la tarde, luz de atardecer entrando por la ventana, escritorio ordenado con laptop, tablet, taza de café metálica y una agenda física de trading, con 'www.trade-share.com' sutilmente visible en la tapa de la agenda.",
  "Plano detalle de un gráfico de TradingView detallado en la pantalla de una laptop premium, con una mano humana operando el mouse con precisión, luz cálida de una lámpara de escritorio, libre de elementos artificiales o fantásticos, con 'www.trade-share.com' en la barra de direcciones del navegador.",
  "Un trader profesional maduro analizando calmadamente una racha en su bitácora digital de TradeShare, anotando ideas de disciplina en su diario físico, taza de café clásica, ambiente de biblioteca de estudio con luz de lectura muy acogedora, con 'www.trade-share.com' en el margen de su diario.",
  "Un espacio de trading ordenado en casa: escritorio de madera de roble, una laptop de última generación con gráficos financieros de alta definición, un termo de café premium, luz suave e indirecta de fondo, atmósfera de enfoque total y paz mental, con 'www.trade-share.com' sutilmente grabado en la madera.",
  "Una videollamada interactiva en una laptop donde un mentor de trading real explica la estructura de mercado a su comunidad de alumnos de forma muy didáctica y humana, tazas de café sobre la mesa, con el logo de 'www.trade-share.com' en la esquina de la interfaz.",
  "Un plano de arriba hacia abajo (flatlay) de un escritorio de trader súper estético y realista: laptop con gráfico alcista verde, taza de espresso, anteojos de lectura, pluma estilográfica y una libreta de notas con la frase grabada 'www.trade-share.com'.",
  "Un trader joven y enfocado analizando pacientemente gráficos de mercado en su laptop en la barra de un café de especialidad luminoso, taza de flat white al lado, luz natural de mañana, ambiente urbano realista, con 'www.trade-share.com' sutilmente visible en la laptop.",
  "Dos traders socios (hombre y mujer) discutiendo ideas frente a una pantalla gigante con gráficos financieros detallados en una oficina corporativa moderna, tazas de café en la mano, actitud colaborativa y profesional, con el enlace 'www.trade-share.com' en la barra superior de la pantalla.",
  "Una tablet flotando en un soporte de escritorio junto a una laptop principal, mostrando el dashboard y estadísticas de rendimiento real del trader en TradeShare, luz de lectura cálida, ambiente relajado e inteligente de noche, y 'www.trade-share.com' impreso sutilmente.",
  "Plano detalle de un reloj de pulsera clásico de trader junto a un teclado mecánico elegante y una taza de café negro, reflejo de gráficos alcistas en el vidrio de la mesa, atmósfera sumamente profesional y realista, con la firma de 'www.trade-share.com'.",
  "Una trader mujer sonriendo complacida mientras cierra su laptop después de cumplir sus reglas diarias de trading, taza de té humeante, estudio en casa con plantas reales y luz solar acogedora de la tarde, y el enlace 'www.trade-share.com' visible de fondo.",
  "Un espacio de estudio de trading minimalista de noche: luz cálida indirecta detrás del monitor principal, cuaderno de apuntes con anotaciones claras de drawdown, taza de café térmica y 'www.trade-share.com' grabado discretamente en la base de la pantalla.",
  "Un trader joven trabajando con concentración desde la mesa de su balcón al atardecer, laptop mostrando gráficos de divisas, una taza de café al lado, ciudad real de fondo con luces suaves difuminadas, ambiente pacífico y libre, con 'www.trade-share.com'.",
  "Un primer plano de una taza de café humeante y un lápiz sobre un plan de trading impreso en papel de alta calidad, con la laptop al fondo mostrando gráficos alcistas en TradingView, estética orgánica e hiperrealista, con 'www.trade-share.com' impreso en la cabecera del plan.",
  "Una trader analizando el mercado financiero en un ipad pro con lápiz óptico, sentada cómodamente en un sillón orejero de cuero junto a una ventana un día lluvioso, luz tenue acogedora, café caliente al lado, con la marca de 'www.trade-share.com' en la esquina de la tablet.",
  "Un escritorio de trading rústico e impecable: madera recuperada, monitor con gráficos detallados de Forex de alta definición, libreta de notas física para registrar emociones de psicotrading, luz natural suave, y 'www.trade-share.com' grabado con elegancia.",
  "Un trader anotando métricas en su diario de consistencia al lado de su laptop en una biblioteca universitaria o de estudio silenciosa, luz suave de lámpara verde clásica, ambiente analítico, consistente y disciplinado, con 'www.trade-share.com'.",
  "Un plano macro de una pluma estilográfica escribiendo reglas de gestión de riesgo sobre un diario de cuero, con la pantalla de una laptop mostrando gráficos alcistas al fondo desdibujado, estética extremadamente premium, y 'www.trade-share.com' en la libreta.",
  "Una trader mujer en su oficina compartiendo ideas de forma muy expresiva y profesional con un colega, rodeados de gráficos reales en pizarras de vidrio y pantallas, luz natural de mañana, con la inscripción 'www.trade-share.com' en la esquina de la pizarra.",
  "Un setup de trading de noche hiperrealista y estético: monitor principal mostrando TradingView con velas japonesas, taza de café de diseño, teclado inalámbrico, luz ambiental ámbar muy acogedora y 'www.trade-share.com' en la esquina inferior.",
  "Un trader profesional maduro cerrando su agenda de cuero con satisfacción al mediodía tras operar una sola killzone horaria de forma sumamente disciplinada, taza de café vacía al lado, oficina moderna, con 'www.trade-share.com' sutil.",
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
  
  return promptLibrary[currentIndex];
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
  "La consistencia no es el resultado de un trade de suerte. Es el hábito diario de seguir un plan riguroso, arriesgar menos del 1% por operación y documentar cada decisión. Conecta tu MT5 a TradeShare para automatizar tu análisis y auditar tus sesgos hoy mismo. 📈☕ trade-share.com #Trading #Consistencia",
  "Operar de noche requiere enfoque y disciplina absoluta. Mientras el mercado duerme, los traders profesionales revisan sus métricas, refinan su ventaja estadística y estudian su bitácora. Deja atrás las planillas manuales; audita tu trading con IA en TradeShare. 🌙✍️ trade-share.com #Psicotrading #Metricas",
  "El trading no se trata de estar pegado a la pantalla 10 horas sufriendo ansiedad. Se trata de esperar tus confluencias exactas con paciencia zen, ejecutar con frialdad y continuar con tu día. Simplifica tu rutina con la plataforma integrada de TradeShare. ☀️🍵 trade-share.com #TradingZen #WorkHard",
  "Escribir tus emociones y reglas antes de hacer clic es tu escudo protector contra la impulsividad. El psicotrading y la bitácora son más importantes que cualquier indicador técnico. Lleva tu diario emocional y métricas conectadas a MT5 en TradeShare. 📔⌨️ trade-share.com #Psicotrading #SmartMoney",
  "Un espacio limpio refleja una mente despejada. Elimina el ruido en tus gráficos y en tu operativa. En TradeShare reunimos tu bitácora, comunidades de mentoría y streaming en vivo en un solo lugar para que te concentres en lo que importa. 🌿💻 trade-share.com #MinimalistTrading #Forex",
  "La verdadera victoria en el trading no es ganar mucho dinero en un día; es cerrar la sesión sabiendo que respetaste tu plan de trading al 100%, pase lo que pase. Comparte tu bitácora auditada en TradeShare y muestra tu consistencia real. 📚✨ trade-share.com #TradingReal #Discipline",
  "Tu rendimiento en el trading merece ser analizado como un negocio profesional. Con la bitácora automatizada y conectada a MT5 en TradeShare, puedes auditar tus estadísticas de consistencia real desde cualquier lugar. ☕📊 trade-share.com #EdicionEspecial #Bussiness",
  "¿Sabías que un Winrate del 40% puede hacerte millonario si tienes una buena gestión de riesgo? Deja de buscar la estrategia perfecta del 100% que no existe. Enfócate en tu ratio riesgo-beneficio y audita tus números en TradeShare. 👓🎯 trade-share.com #EducacionFinanciera #RiskManagement",
  "El estilo de vida de un trader profesional no se mide en Lamborghinis, se mide en libertad de tiempo y paz mental. La consistencia estadística te dará la libertad que buscas. Centraliza tu operativa y comunidad hoy mismo en TradeShare. 🌇☕ trade-share.com #TradingLife #LibertadFinanciera",
  "Si tu pantalla parece un árbol de Navidad lleno de indicadores coloridos que se contradicen, estás paralizando tu análisis. Simplifica tu acción del precio, analiza la liquidez estructural y haz el seguimiento automático en TradeShare. 💻🎯 trade-share.com #PriceAction #SMC",
  "Aceptar una racha de pérdidas con tranquilidad es la marca definitiva de un trader de élite. La resiliencia mental y el control de drawdown son tu pasaje a la consistencia. Analiza tus rachas con el auditor de IA en TradeShare. 📖☕ trade-share.com #Resiliencia #Mindset",
  "Tu plan de trading es tu ley. Si no operas bajo reglas preestablecidas, estás apostando, no haciendo trading. Registra y respeta tus límites diarios usando las herramientas de automatización de TradeShare. 💻🛡️ trade-share.com #DisciplineWins #Rules",
  "Aprender en comunidad acelera tu curva de aprendizaje un 300%. El acceso directo a mentores reales con estadísticas transparentes marca la diferencia. Crea o únete a subcomunidades premium de trading en TradeShare. 🎙️📈 trade-share.com #Mentoria #ComunidadTrading",
  "El éxito surge cuando la preparación se encuentra con la oportunidad. Lleva tu plan de trading impreso, respeta tu gestión de riesgo y mantén tu bitácora automatizada y conectada con IA en TradeShare. ☕🖊️ trade-share.com #EstiloDeVida #Consistencia",
  "Hacer trading en cualquier lugar es posible si cuentas con el ecosistema tecnológico adecuado. Olvídate de los archivos Excel lentos y desactualizados; accede a tus métricas en tiempo real con TradeShare. ☕📲 trade-share.com #DigitalNomad #Tech",
  "La colaboración profesional eleva la consistencia de tu equipo de trading. Compartir análisis de alta precisión de forma interactiva y sin delay es clave. Transmite en vivo y modera tu propia sala privada de trading en TradeShare. 🏢📊 trade-share.com #TradingPartners #B2B",
  "Lo que no se mide, no se puede mejorar. Si no estás auditando tus errores más frecuentes, estás condenado a repetirlos. Deja que nuestra IA de TradeShare detecte tus sesgos de drawdown y te guíe a la rentabilidad. 📊🛡️ trade-share.com #IA #TradingMetrics",
  "El tiempo es tu activo más valioso. Operar solo en las killzones de mayor liquidez horaria te ahorra horas de cansancio y malas decisiones. Organiza tu grilla horaria y mantente disciplinado con TradeShare. ⏱️⌨️ trade-share.com #TimeIsMoney #Killzone",
  "La operación más rentable del día suele ser apagar las pantallas a tiempo. Si ya alcanzaste tu meta o tu límite de pérdida diaria, retírate en paz. Protege tu capital mental y financiero registrando todo en TradeShare. ☀️🍵 trade-share.com #Psicotrading #PazMental",
  "Cuando la pasión y la tecnología se alinean, los resultados son inevitables. Diseña un espacio libre de distracciones, enfócate en tu backtesting estadístico y deja la administración pesada en manos de TradeShare. 🌌💻 trade-share.com #WorkHard #Focus",
  "Operar al aire libre te ayuda a descompresionar las pulsaciones de una sesión volátil. Mantén la calma, respeta tu stop loss inamovible y documenta cada entrada con la app de TradeShare. 🌇💻 trade-share.com #TradingMotivation #MentalHealth",
  "Tu plan de negocios es tu plan de trading. Si tratas esto como un casino, tendrás los mismos resultados que en uno. Respeta tu ratio riesgo-beneficio, define tus pérdidas y audítalas con TradeShare. ☕📄 trade-share.com #ProfessionalTrading #Business",
  "Los días de mercado lento y consolidado son la prueba máxima de paciencia de un trader. Si no hay confluencias claras, no operes. 'No operar también es operar'. Mantén tu disciplina intacta y regístralo en TradeShare. 🌧️📲 trade-share.com #Patience #TradingReal",
  "Un gráfico limpio de SMC (Smart Money Concepts) te da claridad absoluta sobre las zonas de liquidez y order blocks de las grandes instituciones. Analiza con precisión y mantén tu bitácora integrada en TradeShare. 🪵📊 trade-share.com #SmartMoney #InstitutionalTrading",
  "La consistencia se construye en el silencio del estudio riguroso, analizando métricas pasadas para refinar decisiones futuras. Audita tu historial cargado de MT5 de forma instantánea usando TradeShare. 📚⏱️ trade-share.com #Consistency #ForexStudy",
  "Gestionar el riesgo de forma matemática es lo único que separa al trader rentable del que quema cuentas. Protege tu capital con stop loss fijos y deja que la IA de TradeShare analice tus ratios en real. 🖋️🛡️ trade-share.com #RiskManagement #ProTrader",
  "Compartir conocimiento con transparencia y profesionalismo es la base de las mejores academias de trading. Crea salas de chat en vivo con tus alumnos en TradeShare y muestra tu consistencia real. 🏢🎙️ trade-share.com #TradingAcademy #Collaborative",
  "Un setup premium no te hace rentable, pero un ecosistema de trading integrado con bitácora automática conectada a MT5 y análisis de IA definitivamente sí. Optimiza tu trading hoy en TradeShare. 🌌💻 trade-share.com #TradingPremium #Tech",
  "Cerrar la sesión diario con satisfacción tras operar una única killzone de alta probabilidad de forma impecable. Sin revenge-trading, sin euforia desmedida. Documenta tu consistencia en TradeShare. ⏱️📔 trade-share.com #Disciplina #Focus",
  "La automatización es el futuro del trading profesional. Sincroniza tus cuentas de Exness o MT5 con TradeShare y deja que nuestro software se encargue de registrar tus operaciones y detectar tus fallas. 💻🚀 trade-share.com #TradingAutomation #Fintech",
  "La sobrecarga de información genera parálisis en tu análisis. Concentra tus ojos en el flujo institucional de órdenes y deja el registro administrativo de tus métricas al sistema automático de TradeShare. 📱📊 trade-share.com #CleanCharts #Focus",
  "Desarrollar paciencia aburrida es la cualidad secreta de los grandes inversores. El trading rentable no debe ser emocionante, debe ser repetitivo y técnico. Monitorea tu consistencia en TradeShare. 📖☕ trade-share.com #PatiencePays #TradingElite",
  "Mantenerse al día con los fundamentales económicos sin ruidos excesivos. Analiza el impacto de las noticias en la liquidez y registra tu perspectiva en la bitácora de TradeShare. 📰☕ trade-share.com #Macroeconomics #TradingReal",
  "La concentración nocturna para planificar tu killzone del día siguiente. La disciplina de preparar tu sesión con anticipación te da una ventaja invaluable. Haz tu plan de trading en TradeShare. 🌌⌨️ trade-share.com #Preparation #TradingPlan",
  "Administrar el capital propio o de terceros requiere transparencia absoluta y auditorías intachables. Muestra a tus inversores tus estadísticas reales de consistencia generadas automáticamente por TradeShare. 🏢🛡️ trade-share.com #FundManager #Transparency"
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

