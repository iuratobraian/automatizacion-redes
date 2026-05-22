#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# start-local-automation.sh — TradeShare IG Automation Launcher
# Levanta bridge y daemon a través de PM2 (con fallback a npx pm2)
# ─────────────────────────────────────────────────────────────
# ── Cargar NVM y PATH en entornos gráficos de arranque ─────────
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +u 2>/dev/null || true
  source "$NVM_DIR/nvm.sh"
  set -u 2>/dev/null || true
fi

export PATH="$HOME/.nvm/versions/node/$(node -v 2>/dev/null || echo 'default')/bin:$HOME/.local/bin:$HOME/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games:$PATH"

set -euo pipefail

# ── Colores para output legible ──────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${BLUE}[TRADESHARE]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Detectar raíz del proyecto ────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" || fail "No se pudo acceder a: $PROJECT_ROOT"
log "Directorio del proyecto: $PROJECT_ROOT"

# ── Verificar Node.js ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  fail "Node.js no está instalado. Instalá Node.js v18+ primero."
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt 18 ]]; then
  fail "Node.js v$NODE_VERSION detectado. Se requiere v18 o superior."
fi
ok "Node.js $(node --version)"

# ── Verificar dependencias npm ────────────────────────────────
if [[ ! -d "node_modules" ]]; then
  warn "node_modules no encontrado. Ejecutando npm install..."
  npm install || fail "npm install falló"
fi
ok "Dependencias npm presentes"

# ── Verificar Playwright Chromium ─────────────────────────────
if ! node -e "
  import('playwright').then(m => {
    const exe = m.chromium.executablePath();
    const fs  = require('fs');
    if (!fs.existsSync(exe)) process.exit(1);
  }).catch(() => process.exit(1));
" 2>/dev/null; then
  warn "Playwright Chromium no encontrado. Instalando..."
  npx playwright install chromium || fail "No se pudo instalar Playwright Chromium"
fi
ok "Playwright Chromium disponible"

# ── Verificar archivo .env.local ──────────────────────────────
if [[ ! -f ".env.local" ]]; then
  log "Creando .env.local básico..."
  echo 'IG_ACCOUNT="braiurato"' > .env.local
fi

# Cargar variables de entorno
set -a
# shellcheck source=/dev/null
source .env.local
set +a

# Asegurar que IG_ACCOUNT esté definido
if [[ -z "${IG_ACCOUNT:-}" ]]; then
  warn "IG_ACCOUNT no encontrado en .env.local. Usando 'braiurato' por defecto."
  echo 'IG_ACCOUNT="braiurato"' >> .env.local
  IG_ACCOUNT="braiurato"
fi

# Advertir sobre GEMINI_API_KEY pero no crasehar el inicio
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  warn "GEMINI_API_KEY no está definida en .env.local."
  warn "👉 Por favor, agregá GEMINI_API_KEY=\"TU_KEY\" en .env.local para habilitar la IA en DMs y comentarios."
fi
ok "Variables de entorno validadas (.env.local)"

# ── Verificar archivo de sesión de Instagram ──────────────────
SESSION_FILE=".agent/instagram_auth_${IG_ACCOUNT}.json"
if [[ ! -f "$SESSION_FILE" ]]; then
  fail "Archivo de sesión no encontrado: $SESSION_FILE\nEjecutá el script de login para generarlo."
fi
ok "Sesión de Instagram encontrada: $SESSION_FILE"

# ── Crear carpeta de logs ─────────────────────────────────────
mkdir -p .agent
ok "Carpeta .agent/ lista para logs"

# ── Detectar PM2 (global o npx) ───────────────────────────────
PM2_CMD=""
if command -v pm2 &>/dev/null; then
  PM2_CMD="pm2"
  ok "PM2 encontrado globalmente: $(pm2 --version)"
elif npx pm2 --version &>/dev/null 2>&1; then
  PM2_CMD="npx pm2"
  warn "PM2 no instalado globalmente. Usando npx pm2."
  warn "Para instalarlo permanentemente: npm install -g pm2"
else
  fail "PM2 no disponible. Instalalo con: npm install -g pm2"
fi

# ── Verificar si ya hay procesos corriendo ────────────────────
log "Verificando procesos PM2 existentes..."
if $PM2_CMD list 2>/dev/null | grep -q "tradeshare-"; then
  warn "Procesos TradeShare ya corriendo en PM2. Reiniciando..."
  $PM2_CMD reload ecosystem.config.cjs --env production 2>/dev/null || \
    $PM2_CMD restart ecosystem.config.cjs 2>/dev/null || true
else
  log "Levantando servicios con PM2..."
  $PM2_CMD start ecosystem.config.cjs --env production
fi

# ── Guardar configuración de PM2 para arranque automático ─────
log "Guardando configuración PM2 para arranque automático..."
$PM2_CMD save 2>/dev/null || warn "No se pudo guardar la lista PM2 (normal en primera vez)"

# ── Mostrar estado ────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "TradeShare Automation iniciada 🚀"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
$PM2_CMD list
echo ""
echo -e "  ${BLUE}Comandos útiles:${NC}"
echo "  $PM2_CMD logs tradeshare-daemon   → logs del daemon en tiempo real"
echo "  $PM2_CMD logs tradeshare-bridge   → logs del bridge"
echo "  $PM2_CMD monit                    → monitor de CPU/RAM en vivo"
echo "  $PM2_CMD stop all                 → detener todo"
echo "  cat .agent/daemon-error.log       → errores del daemon"
echo ""
echo -e "  ${YELLOW}Webhook manual de prueba:${NC}"
echo "  curl -s http://127.0.0.1:5678/webhook/test-marketing"
echo ""

# ── Abrir los dashboards en el navegador del usuario ──────────
log "Iniciando vistas gráficas automáticas (xdg-open)..."
sleep 3
xdg-open http://localhost:5680/dashboard || true
sleep 1
xdg-open http://localhost:3000 || true
sleep 1
xdg-open http://localhost:5678 || true
echo ""
