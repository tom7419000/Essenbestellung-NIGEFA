#!/usr/bin/env bash
#
# update-essen-nigefa.sh
# ------------------------------------------------------------------------------
# Aktualisiert eine bestehende, mit install-essen-nigefa.sh eingerichtete
# Installation auf einem EIGENSTÄNDIGEN Ubuntu Server (systemd) – ohne
# Datenverlust.
#
# >> NICHT für Plesk verwenden! <<
# Dieses Skript benötigt root und steuert einen systemd-Dienst. Das Update
# einer Plesk-Installation erfolgt über SSH/Git + Node.js-Erweiterung –
# Anleitung: docs/plesk-installation.md
#
# Das Skript
#   * stoppt den Dienst,
#   * legt VOR dem Update ein Backup an (Datenbank, Branding-Dateien,
#     JWT-Secret, Dienst-Konfiguration),
#   * kopiert den neuen Programmcode (Laufzeitdaten in server/data und die
#     Konfiguration unter /etc bleiben unangetastet),
#   * installiert Abhängigkeiten und baut das Frontend neu,
#   * führt additive Datenbankmigrationen aus (neue Spalten mit Defaults,
#     keine destruktiven Änderungen),
#   * startet den Dienst wieder und prüft die Erreichbarkeit,
#   * gibt eine Zusammenfassung aus (Version, Migrationen, Backup-Pfad).
#
# Aufruf (aus dem frisch geklonten/aktualisierten Repository heraus):
#   sudo bash update-essen-nigefa.sh
#
# Im Fehlerfall lässt sich der vorherige Zustand aus dem Backup wiederherstellen:
#   sudo systemctl stop essen-nigefa
#   sudo tar -xzf /opt/essen-nigefa/backups/<backup>.tar.gz -C /
#   sudo systemctl start essen-nigefa
# ------------------------------------------------------------------------------

set -euo pipefail

# ----------------------------- Konfiguration ----------------------------------

INSTALL_DIR="${INSTALL_DIR:-/opt/essen-nigefa}"
SERVICE_USER="${SERVICE_USER:-essen}"
SERVICE_NAME="${SERVICE_NAME:-essen-nigefa}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"          # so viele Backups aufbewahren
SKIP_SERVICE="${SKIP_SERVICE:-0}"          # 1 = systemctl-Schritte überspringen (nur für Tests)

CONFIG_DIR="/etc/${SERVICE_NAME}"
ENV_FILE="${CONFIG_DIR}/${SERVICE_NAME}.env"
BACKUP_DIR="${INSTALL_DIR}/backups"
DATA_DIR="${INSTALL_DIR}/server/data"

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

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    log "Root-Rechte erforderlich – starte mit sudo neu ..."
    exec sudo -E bash "$0" "$@"
  fi
  err "Bitte als root bzw. mit sudo ausführen."
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "${SOURCE_DIR}/server/package.json" ] || [ ! -f "${SOURCE_DIR}/client/package.json" ]; then
  err "Bitte das Skript aus dem geklonten Repository heraus ausführen (server/ und client/ nicht gefunden)."
fi
if [ ! -d "${INSTALL_DIR}/server" ]; then
  err "Keine bestehende Installation in ${INSTALL_DIR} gefunden – für Neuinstallationen bitte install-essen-nigefa.sh verwenden."
fi
if [ "$SOURCE_DIR" = "$INSTALL_DIR" ]; then
  err "Bitte aus einem separaten Quellverzeichnis ausführen, nicht direkt in ${INSTALL_DIR}."
fi
command -v node >/dev/null 2>&1 || err "Node.js wurde nicht gefunden – ist die Installation intakt?"
NODE_BIN="$(command -v node)"

NEW_VERSION="unbekannt"
if command -v git >/dev/null 2>&1 && git -C "$SOURCE_DIR" rev-parse --short HEAD >/dev/null 2>&1; then
  NEW_VERSION="$(git -C "$SOURCE_DIR" rev-parse --short HEAD)"
fi
OLD_VERSION="unbekannt"
[ -f "${INSTALL_DIR}/.version" ] && OLD_VERSION="$(cat "${INSTALL_DIR}/.version")"

log "Update der Essensbestellungs-App"
echo "    Quelle    : ${SOURCE_DIR} (${NEW_VERSION})"
echo "    Ziel      : ${INSTALL_DIR} (bisher: ${OLD_VERSION})"
echo "    Dienst    : ${SERVICE_NAME}"
echo

# ----------------------------- 1) Dienst stoppen ------------------------------

if [ "$SKIP_SERVICE" != "1" ]; then
  log "Stoppe Dienst '${SERVICE_NAME}' ..."
  if systemctl stop "$SERVICE_NAME" 2>/dev/null; then
    ok "Dienst gestoppt."
  else
    warn "Dienst konnte nicht gestoppt werden (läuft evtl. nicht) – fahre fort."
  fi
else
  warn "SKIP_SERVICE=1 – Dienststeuerung wird übersprungen."
fi

# ----------------------------- 2) Backup --------------------------------------

log "Lege Backup an ..."
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/essen-nigefa-backup-${STAMP}.tar.gz"

BACKUP_PATHS=()
[ -d "$DATA_DIR" ] && BACKUP_PATHS+=("$DATA_DIR")
[ -f "$ENV_FILE" ] && BACKUP_PATHS+=("$ENV_FILE")
if [ ${#BACKUP_PATHS[@]} -eq 0 ]; then
  err "Weder Datenverzeichnis noch Konfiguration gefunden – Abbruch, um nichts zu beschädigen."
fi

# Absolute Pfade sichern (Wiederherstellung mit: tar -xzf <datei> -C /)
tar -czf "$BACKUP_FILE" --absolute-names "${BACKUP_PATHS[@]}" 2>/dev/null \
  || tar -czf "$BACKUP_FILE" -P "${BACKUP_PATHS[@]}"
BACKUP_OK=false
if tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
  BACKUP_OK=true
  ok "Backup erstellt und geprüft: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  err "Backup konnte nicht erstellt/gelesen werden – Update abgebrochen."
fi

# Alte Backups aufräumen (die neuesten ${BACKUP_KEEP} bleiben)
find "$BACKUP_DIR" -maxdepth 1 -name 'essen-nigefa-backup-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | tail -n "+$((BACKUP_KEEP + 1))" | cut -d' ' -f2- \
  | while read -r old; do rm -f "$old"; done

# ----------------------------- 3) Code aktualisieren --------------------------

log "Kopiere neuen Programmcode nach ${INSTALL_DIR} ..."
# Laufzeitdaten (server/data), Backups und Secrets bleiben unangetastet.
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'client/dist' \
  --exclude 'server/data' \
  --exclude 'backups' \
  --exclude '.version' \
  --exclude '*.log' \
  --exclude 'client/.env' \
  --exclude 'server/.env' \
  "${SOURCE_DIR}/" "${INSTALL_DIR}/"
ok "Code aktualisiert (server/data, .env-Dateien und Backups unverändert)."

# ----------------------------- 4) Abhängigkeiten & Build ----------------------

export npm_config_fund=false
export npm_config_audit=false
export npm_config_update_notifier=false

log "Installiere Server-Abhängigkeiten ..."
( cd "${INSTALL_DIR}/server" && npm install --omit=dev --no-progress >/dev/null 2>&1 )
ok "Server-Abhängigkeiten installiert."

log "Baue Frontend neu (kann einen Moment dauern) ..."
( cd "${INSTALL_DIR}/client" && npm install --no-progress >/dev/null 2>&1 && npm run build >/dev/null 2>&1 )
rm -rf "${INSTALL_DIR}/client/node_modules"
ok "Frontend gebaut (client/dist)."

# ----------------------------- 5) Datenbankmigrationen ------------------------

log "Führe Datenbankmigrationen aus (additiv, nicht-destruktiv) ..."
MIGRATION_SUMMARY="$(
  cd "${INSTALL_DIR}/server" && "$NODE_BIN" --input-type=module -e "
    const { db, runMigrations } = await import('./src/db.js');
    const result = runMigrations({ log: (m) => console.log('    ' + m) });
    if (result.applied.length === 0) {
      console.log('    Keine neuen Migrationen – Schema ist aktuell (Version ' + result.to + ').');
    } else {
      console.log('    Schema-Version: ' + result.from + ' -> ' + result.to);
    }
    db.close();
  "
)"
echo "$MIGRATION_SUMMARY"
ok "Migrationen abgeschlossen."

echo "$NEW_VERSION" > "${INSTALL_DIR}/.version"

# ----------------------------- 6) Rechte & Dienststart ------------------------

log "Setze Dateirechte ..."
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
ok "Eigentümer auf '${SERVICE_USER}' gesetzt."

HEALTH="übersprungen"
if [ "$SKIP_SERVICE" != "1" ]; then
  log "Starte Dienst '${SERVICE_NAME}' ..."
  systemctl daemon-reload
  systemctl start "$SERVICE_NAME"
  ok "Dienst gestartet."

  PORT="$(grep -oP '^PORT=\K.*' "$ENV_FILE" 2>/dev/null || echo 3001)"
  log "Prüfe Erreichbarkeit auf Port ${PORT} ..."
  HEALTH="FEHLGESCHLAGEN – bitte 'journalctl -u ${SERVICE_NAME}' prüfen"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
      HEALTH="OK (http://127.0.0.1:${PORT}/)"
      break
    fi
    sleep 1
  done
fi

# ----------------------------- 7) Zusammenfassung -----------------------------

echo
echo -e "${C_GREEN}============================================================${C_RESET}"
echo -e "${C_GREEN} Update abgeschlossen${C_RESET}"
echo -e "${C_GREEN}============================================================${C_RESET}"
echo
echo "  Version           :  ${OLD_VERSION} -> ${NEW_VERSION}"
echo "  Backup            :  $($BACKUP_OK && echo "erfolgreich – ${BACKUP_FILE}" || echo 'FEHLGESCHLAGEN')"
echo "  Datenbank         :  erhalten (${DATA_DIR}) – Migrationen siehe oben"
echo "  Konfiguration     :  unverändert (${ENV_FILE})"
echo "  Dienststatus      :  ${HEALTH}"
echo
echo "  Wiederherstellung im Fehlerfall:"
echo "    sudo systemctl stop ${SERVICE_NAME}"
echo "    sudo tar -xzf ${BACKUP_FILE} -C /"
echo "    sudo systemctl start ${SERVICE_NAME}"
echo
