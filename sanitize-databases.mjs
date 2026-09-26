import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const AGENT_DIR = path.join(ROOT, '.agent');

const replacements = [
  // Hashtags
  { regex: /#TradeShareGratis\b/gi, rep: '#TradeSharePro' },
  { regex: /#TradingGratis\b/gi, rep: '#TradingPro' },
  { regex: /#Gratis\b/gi, rep: '#TradeShare' },
  { regex: /#Gratuito\b/gi, rep: '#Trading' },

  // Frases compuestas con mayúsculas y minúsculas
  { regex: /100%\s*gratis/gi, rep: '100% abierto' },
  { regex: /100%\s*gratuito/gi, rep: '100% institucional' },
  { regex: /totalmente\s*gratis/gi, rep: 'sin costo de suscripción' },
  { regex: /totalmente\s*gratuito/gi, rep: 'sin costo de suscripción' },
  { regex: /totalmente\s*gratuita/gi, rep: 'totalmente abierta' },
  { regex: /totalmente\s*gratuitos/gi, rep: 'totalmente abiertos' },
  { regex: /totalmente\s*gratuitas/gi, rep: 'totalmente abiertas' },
  { regex: /gratis\s+para\s+todos/gi, rep: 'acceso abierto para todos' },
  { regex: /gratuito\s+para\s+todos/gi, rep: 'acceso abierto para todos' },
  { regex: /gratuita\s+para\s+todos/gi, rep: 'acceso abierto para todos' },

  { regex: /de\s+bienvenida\s+gratuito/gi, rep: 'de bienvenida exclusivo' },
  { regex: /de\s+bienvenida\s+gratis/gi, rep: 'de bienvenida exclusivo' },
  { regex: /acceso\s+gratuito/gi, rep: 'acceso abierto' },
  { regex: /acceso\s+gratis/gi, rep: 'acceso directo' },
  { regex: /ACCESO\s+GRATUITO/g, rep: 'ACCESO ABIERTO' },
  { regex: /ACCESO\s+GRATIS/g, rep: 'ACCESO DIRECTO' },

  { regex: /de\s+forma\s+gratuita/gi, rep: 'de forma abierta' },
  { regex: /de\s+forma\s+gratis/gi, rep: 'de forma abierta' },

  { regex: /auditar\s+tu\s+cuenta\s+gratis/gi, rep: 'auditar tu cuenta con Bitácora Pro' },
  { regex: /auditar\s+tus\s+trades\s+gratis/gi, rep: 'auditar tus trades con rigor matemático' },
  { regex: /trackear\s+todo\s+gratis/gi, rep: 'trackear todo de forma auditada' },
  { regex: /tracke[aá]\s+este\s+setup\s+gratis/gi, rep: 'trackeá este setup con Bitácora Pro' },
  { regex: /ver\s+tu\s+progreso\s+gratis/gi, rep: 'ver tu progreso auditado' },
  { regex: /registrar\s+todo\s+gratis/gi, rep: 'registrar todo con Bitácora Pro' },
  { regex: /registro\s+gratuito/gi, rep: 'registro oficial' },
  { regex: /registro\s+gratis/gi, rep: 'registro oficial' },

  { regex: /unite\s+gratis/gi, rep: 'unite hoy' },
  { regex: /Unite\s+gratis/gi, rep: 'Unite hoy' },
  { regex: /[uú]nete\s+gratis/gi, rep: 'únete hoy' },
  { regex: /[UÚ]nete\s+gratis/gi, rep: 'Únete hoy' },
  { regex: /sumate\s+gratis/gi, rep: 'sumate a TradeShare' },
  { regex: /Sumate\s+gratis/gi, rep: 'Sumate a TradeShare' },
  { regex: /s[uú]mate\s+gratis/gi, rep: 'súmate a TradeShare' },
  { regex: /S[uú]mate\s+gratis/gi, rep: 'Súmate a TradeShare' },

  { regex: /herramientas\s+gratuitas/gi, rep: 'herramientas profesionales' },
  { regex: /herramienta\s+gratuita/gi, rep: 'herramienta profesional' },
  { regex: /herramientas\s+gratis/gi, rep: 'herramientas profesionales' },
  { regex: /herramienta\s+gratis/gi, rep: 'herramienta profesional' },
  { regex: /cursos\s+gratuitos/gi, rep: 'cursos formativos' },
  { regex: /curso\s+gratuito/gi, rep: 'curso formativo' },
  { regex: /comunidades\s+gratuitas/gi, rep: 'comunidades oficiales' },
  { regex: /comunidad\s+gratuita/gi, rep: 'comunidad oficial' },
  { regex: /comunidad\s+es\s+gratis/gi, rep: 'comunidad es de libre acceso' },
  { regex: /comunidad\s+es\s+GRATIS/g, rep: 'comunidad es de LIBRE ACCESO' },

  { regex: /bit[aá]cora\s+pro\s+gratis/gi, rep: 'Bitácora Pro auditada' },
  { regex: /bit[aá]cora\s+gratis/gi, rep: 'Bitácora Pro auditada' },
  { regex: /sin\s+pagar\s+nada/gi, rep: 'con infraestructura optimizada' },
  { regex: /sin\s+costo\s+alguno/gi, rep: 'con acceso directo' },

  // Reemplazos directos individuales
  { regex: /\bGRATIS\b/g, rep: 'PRO' },
  { regex: /\bGratis\b/g, rep: 'Abierto' },
  { regex: /\bgratis\b/g, rep: 'sin costo' },
  { regex: /\bGRATUITO\b/g, rep: 'INSTITUCIONAL' },
  { regex: /\bGratuito\b/g, rep: 'Institucional' },
  { regex: /\bgratuito\b/g, rep: 'institucional' },
  { regex: /\bGRATUITA\b/g, rep: 'INSTITUCIONAL' },
  { regex: /\bGratuita\b/g, rep: 'Institucional' },
  { regex: /\bgratuita\b/g, rep: 'institucional' },
  { regex: /\bGRATUITOS\b/g, rep: 'INSTITUCIONALES' },
  { regex: /\bGratuitos\b/g, rep: 'Institucionales' },
  { regex: /\bgratuitos\b/g, rep: 'institucionales' },
  { regex: /\bGRATUITAS\b/g, rep: 'INSTITUCIONALES' },
  { regex: /\bGratuitas\b/g, rep: 'Institucionales' },
  { regex: /\bgratuitas\b/g, rep: 'institucionales' },
];

function sanitizeContent(raw) {
  let text = raw;
  for (const { regex, rep } of replacements) {
    text = text.replace(regex, rep);
  }
  return text;
}

const targetFiles = [
  'posts-db.json',
  'marketing_vault.json',
  'social_db.json',
  'local-ai-activity.json',
  'leads-db.json',
  'pitch-templates-db.json',
  'comment_replies.json',
  'marketing_strategy.json',
  'facebook_groups_state.json',
  'local_portal_feed.json'
];

let totalCleaned = 0;

for (const fileName of targetFiles) {
  const filePath = path.join(AGENT_DIR, fileName);
  if (!fs.existsSync(filePath)) continue;

  const original = fs.readFileSync(filePath, 'utf8');
  const beforeMatches = (original.match(/gratis|gratuito|gratuita|gratuitos|gratuitas/gi) || []).length;

  if (beforeMatches > 0) {
    const cleaned = sanitizeContent(original);
    fs.writeFileSync(filePath, cleaned, 'utf8');
    const afterMatches = (cleaned.match(/gratis|gratuito|gratuita|gratuitos|gratuitas/gi) || []).length;
    console.log(`✅ ${fileName}: ${beforeMatches} eliminados -> ${afterMatches} restantes.`);
    totalCleaned += (beforeMatches - afterMatches);
  } else {
    console.log(`✓ ${fileName}: Ya estaba limpio (0 coincidencias).`);
  }
}

console.log(`\n🎉 Total depurado: ${totalCleaned} ocurrencias erradicadas.`);
