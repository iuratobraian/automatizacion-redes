#!/usr/bin/env bash

# 🚀 TradeShare Marketing Boot Script
# Este script inicia todos los servicios necesarios para la automatización total.

echo "🌟 Iniciando Ecosistema de Marketing Autónomo..."

# 1. Limpieza de procesos previos
echo "🧹 Limpiando procesos antiguos..."
pkill -f ig-daemon.mjs || true
pkill -f ig-bridge-v2.mjs || true

# 2. Iniciar el Bridge Local (para comunicación con n8n)
echo "🔌 Iniciando Bridge Local..."
node scripts/ig-bridge-v2.mjs > .agent/bridge_log.txt 2>&1 &
echo "✅ Bridge iniciado en segundo plano."

# 3. Iniciar el Demonio de Instagram (Listener de DMs/Comments)
echo "👂 Iniciando Listener de Instagram (Demonio)..."
node scripts/ig-daemon.mjs > .agent/daemon_log.txt 2>&1 &
echo "✅ Demonio iniciado en segundo plano."

# 4. Verificar n8n
if command -v n8n &> /dev/null; then
    echo "🧠 n8n detectado. Asegúrate de tener el workflow 'TradeShare Master' activo."
else
    echo "⚠️ Advertencia: n8n no detectado en el PATH. Inícialo manualmente si es necesario."
fi

echo "✨ Todo el sistema está operativo. Revisa los logs en .agent/ para más detalles."
