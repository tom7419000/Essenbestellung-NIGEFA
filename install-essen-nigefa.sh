#!/usr/bin/env bash
#
# install-essen-nigefa.sh
# ------------------------------------------------------------------------------
# Vollautomatische Installation der Essensbestellungs-App auf Ubuntu Server.
#
# Das Skript
#   * installiert alle Systempakete (Node.js, Build-Tools, git, rsync),
#   * kopiert die App nach /opt/essen-nigefa,
#   * installiert Abhängigkeiten und baut das Frontend,
#   * legt einen dedizierten Systembenutzer an,
#   * erzeugt eine sichere JWT-Konfiguration,
#   * befüllt die Datenbank beim ersten Mal mit Demo-Daten,
#   * richtet einen systemd-Dienst ein (Autostart + Neustart bei Absturz)
#     und startet ihn – ganz ohne manuelles Anlegen von Diensten.
#
# Aufruf (aus dem geklonten Repository heraus):
#   sudo bash install-essen-nigefa.sh
#
# Deinstallation:
#   sudo bash install-essen-nigefa.sh uninstall
#
# Konfiguration über Umgebungsvariablen (optional), z. B.:
#   sudo PORT=8080 APP_TIMEZONE=Europe/Vienna bash install-essen-nigefa.sh
# ------------------------------------------------------------------------------

set -euo pipefail

# ----------------------------- Konfiguration ----------------------------------

INSTALL_DIR="${INSTALL_DIR:-/opt/essen-nigefa}"   # Zielverzeichnis der Installation
SERVICE_USER="${SERVICE_USER:-essen}"             # Systembenutzer für den Dienst
SERVICE_NAME="${SERVICE_NAME:-essen-nigefa}"      # Name des systemd-Dienstes
PORT="${PORT:-3001}"                              # Port, auf dem die App läuft
APP_TIMEZONE="${APP_TIMEZONE:-Europe/Berlin}"     # Zeitzone der Anwendung
NODE_MAJOR="${NODE_MAJOR:-20}"                     # Mindest-/Ziel-Node.js-Version
RUN_SEED="${RUN_SEED:-auto}"                       # auto | yes | no

CONFIG_DIR="/etc/${SERVICE_NAME}"
ENV_FILE="${CONFIG_DIR}/${SERVICE_NAME}.env"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
DB_FILE="${INSTALL_DIR}/server/data/app.db"

# ----------------------------- Ausgabe-Helfer ---------------------------------

if [ -t 1 ]; then
  C_BLUE="\033[1;34m"; C_GREEN="\033[1;32m"; C_YELLOW="\033[1;33m"; C_RED="\033[1;31m"; C_RESET="\033[0m"
else
  C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi

log()  { echo -e "${C_BLUE}==>${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}  ✓${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}  !${C_RESET} $*"; }
err()  { echo -e "${C_RED}Fehler:${C_RESET} $*" >&2; exit 1; }

# ----------------------------- Vorprüfungen -----------------------------------

# Bei fehlenden Root-Rechten automatisch mit sudo neu starten.
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    log "Root-Rechte erforderlich – starte mit sudo neu ..."
    exec sudo -E bash "$0" "$@"
  fi
  err "Bitte als root bzw. mit sudo ausführen."
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ----------------------------- Deinstallation ---------------------------------

uninstall() {
  log "Deinstalliere ${SERVICE_NAME} ..."
  if systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
    systemctl disable --now "${SERVICE_NAME}" 2>/dev/null || true
    ok "Dienst gestoppt und deaktiviert."
  fi
  rm -f "$UNIT_FILE"
  systemctl daemon-reload
  warn "Belassen: Programmdaten in ${INSTALL_DIR} und Konfiguration in ${CONFIG_DIR}."
  warn "Zum vollständigen Entfernen bei Bedarf manuell löschen:"
  echo "    sudo rm -rf ${INSTALL_DIR} ${CONFIG_DIR}"
  echo "    sudo userdel ${SERVICE_USER}"
  ok "Dienst entfernt."
  exit 0
}

if [ "${1:-}" = "uninstall" ] || [ "${1:-}" = "--uninstall" ]; then
  uninstall
fi

if ! command -v apt-get >/dev/null 2>&1; then
  err "Dieses Skript ist für Ubuntu/Debian (apt) gedacht."
fi

if [ ! -f "${SOURCE_DIR}/server/package.json" ] || [ ! -f "${SOURCE_DIR}/client/package.json" ]; then
  err "Bitte das Skript aus dem geklonten Repository heraus ausführen (server/ und client/ nicht gefunden)."
fi

log "Installation der Essensbestellungs-App (NIGEFA)"
echo "    Quelle    : ${SOURCE_DIR}"
echo "    Ziel      : ${INSTALL_DIR}"
echo "    Dienst    : ${SERVICE_NAME} (Benutzer: ${SERVICE_USER})"
echo "    Port      : ${PORT}"
echo "    Zeitzone  : ${APP_TIMEZONE}"
echo

# ----------------------------- 1) Systempakete --------------------------------

log "Installiere Systempakete ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq ca-certificates curl gnupg git rsync build-essential python3 >/dev/null
ok "Basis-Pakete installiert."

# ----------------------------- 2) Node.js -------------------------------------

current_major=0
if command -v node >/dev/null 2>&1; then
  current_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi

if [ "$current_major" -ge "$NODE_MAJOR" ]; then
  ok "Node.js $(node -v) ist bereits vorhanden."
else
  log "Installiere Node.js ${NODE_MAJOR}.x über NodeSource ..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  ok "Node.js $(node -v) installiert."
fi

NODE_BIN="$(command -v node)"

# ----------------------------- 3) Systembenutzer ------------------------------

if id -u "$SERVICE_USER" >/dev/null 2>&1; then
  ok "Benutzer '${SERVICE_USER}' existiert bereits."
else
  log "Lege Systembenutzer '${SERVICE_USER}' an ..."
  useradd --system --create-home --home-dir "/var/lib/${SERVICE_USER}" \
    --shell /usr/sbin/nologin "$SERVICE_USER"
  ok "Benutzer angelegt."
fi

# ----------------------------- 4) Dateien kopieren ----------------------------

if [ "$SOURCE_DIR" != "$INSTALL_DIR" ]; then
  log "Kopiere Anwendung nach ${INSTALL_DIR} ..."
  mkdir -p "$INSTALL_DIR"
  # Laufzeitdaten (server/data) und Secrets bleiben bei Updates erhalten.
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'client/dist' \
    --exclude 'server/data' \
    --exclude '*.log' \
    "${SOURCE_DIR}/" "${INSTALL_DIR}/"
  ok "Dateien kopiert."
else
  ok "Installation erfolgt direkt im Quellverzeichnis."
fi

mkdir -p "${INSTALL_DIR}/server/data"

# ----------------------------- 5) Abhängigkeiten & Build ----------------------

export npm_config_fund=false
export npm_config_audit=false
export npm_config_update_notifier=false

log "Installiere Server-Abhängigkeiten ..."
( cd "${INSTALL_DIR}/server" && npm install --omit=dev --no-progress >/dev/null 2>&1 )
ok "Server-Abhängigkeiten installiert."

log "Baue Frontend (kann einen Moment dauern) ..."
( cd "${INSTALL_DIR}/client" && npm install --no-progress >/dev/null 2>&1 && npm run build >/dev/null 2>&1 )
# node_modules des Clients werden nach dem Build nicht mehr benötigt.
rm -rf "${INSTALL_DIR}/client/node_modules"
ok "Frontend gebaut (client/dist)."

# ----------------------------- 6) Konfiguration / JWT -------------------------

log "Schreibe Konfiguration nach ${ENV_FILE} ..."
mkdir -p "$CONFIG_DIR"

# Vorhandenes JWT-Secret beibehalten, damit Anmeldungen ein Update überstehen.
if [ -f "$ENV_FILE" ] && grep -q '^JWT_SECRET=' "$ENV_FILE"; then
  JWT_SECRET="$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
  ok "Bestehendes JWT-Secret übernommen."
else
  JWT_SECRET="$("$NODE_BIN" -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
  ok "Neues JWT-Secret erzeugt."
fi

cat > "$ENV_FILE" <<EOF
# Automatisch erzeugt von install-essen-nigefa.sh
NODE_ENV=production
PORT=${PORT}
APP_TIMEZONE=${APP_TIMEZONE}
JWT_SECRET=${JWT_SECRET}
EOF
chmod 600 "$ENV_FILE"
ok "Konfiguration geschrieben (nur für root lesbar)."

# ----------------------------- 7) Datenbank / Seed ----------------------------

do_seed=false
case "$RUN_SEED" in
  yes) do_seed=true ;;
  no)  do_seed=false ;;
  auto) [ -f "$DB_FILE" ] || do_seed=true ;;
esac

if $do_seed; then
  log "Befülle Datenbank mit Demo-Daten ..."
  ( cd "${INSTALL_DIR}/server" && APP_TIMEZONE="$APP_TIMEZONE" "$NODE_BIN" src/seed.js )
  SEEDED=true
else
  ok "Bestehende Datenbank bleibt unverändert (kein Seed)."
  SEEDED=false
fi

# ----------------------------- 8) Rechte setzen -------------------------------

log "Setze Dateirechte ..."
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
ok "Eigentümer auf '${SERVICE_USER}' gesetzt."

# ----------------------------- 9) systemd-Dienst ------------------------------

log "Richte systemd-Dienst '${SERVICE_NAME}' ein ..."
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Essensbestellung NIGEFA (Zwei-Phasen-Abstimmung)
Documentation=https://github.com/tom7419000/Essenbestellung-NIGEFA
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/server
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} src/index.js
Restart=on-failure
RestartSec=5

# Absicherung
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${INSTALL_DIR}/server/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
systemctl restart "$SERVICE_NAME"
ok "Dienst eingerichtet und gestartet (Autostart aktiv)."

# ----------------------------- 10) Firewall (optional) ------------------------

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
  ok "UFW-Regel für Port ${PORT}/tcp hinzugefügt."
fi

# ----------------------------- 11) Health-Check -------------------------------

log "Prüfe Erreichbarkeit ..."
healthy=false
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
    healthy=true
    break
  fi
  sleep 1
done

echo
if $healthy; then
  ok "Server antwortet auf http://127.0.0.1:${PORT}/"
else
  warn "Server antwortet noch nicht – Status prüfen mit:  systemctl status ${SERVICE_NAME}"
fi

# ----------------------------- 12) Zusammenfassung ----------------------------

IP_ADDR="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP_ADDR" ] || IP_ADDR="<server-ip>"

echo
echo -e "${C_GREEN}============================================================${C_RESET}"
echo -e "${C_GREEN} Installation abgeschlossen${C_RESET}"
echo -e "${C_GREEN}============================================================${C_RESET}"
echo
echo "  Aufruf im Browser :  http://${IP_ADDR}:${PORT}/"
echo "  Dienststatus      :  systemctl status ${SERVICE_NAME}"
echo "  Logs anzeigen     :  journalctl -u ${SERVICE_NAME} -f"
echo "  Neu starten       :  systemctl restart ${SERVICE_NAME}"
echo "  Konfiguration     :  ${ENV_FILE}"
echo "  Programmdaten     :  ${INSTALL_DIR}"
echo
if $SEEDED; then
  echo "  Demo-Anmeldedaten (Benutzername / Passwort):"
  echo "    admin / admin123      (Administrator)"
  echo "    anna  / passwort123   (Benutzerin, Organisatorin)"
  echo "    ben   / passwort123   (Benutzer)"
  echo "    clara / passwort123   (Benutzerin)"
  echo
  warn "Bitte das Admin-Passwort nach der ersten Anmeldung ändern."
fi
echo
