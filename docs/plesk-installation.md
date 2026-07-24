# Installation unter Plesk (Node.js-Erweiterung / Passenger)

Diese Anleitung beschreibt Schritt für Schritt den Betrieb des
Essensbestellungs-Portals auf einem Server mit **Plesk** (Obsidian) und
aktivierter **Node.js-Erweiterung** (basiert auf Phusion Passenger). Sie ist so
gehalten, dass sie sich 1:1 nachvollziehen lässt.

> Die Skripte [`install-essen-nigefa.sh`](../install-essen-nigefa.sh) und
> [`update-essen-nigefa.sh`](../update-essen-nigefa.sh) sind **nur für
> eigenständige Ubuntu-Server** (root + systemd) gedacht – unter Plesk werden
> sie **nicht** verwendet.

## Inhalt

1. [Voraussetzungen](#1-voraussetzungen)
2. [Architektur unter Plesk](#2-architektur-unter-plesk)
3. [Code auf den Server bringen](#3-code-auf-den-server-bringen)
4. [Node.js-Anwendung in Plesk einrichten](#4-nodejs-anwendung-in-plesk-einrichten)
5. [Umgebungsvariablen setzen](#5-umgebungsvariablen-setzen)
6. [Abhängigkeiten installieren & Frontend bauen](#6-abhängigkeiten-installieren--frontend-bauen)
7. [Datenbank & erstes Admin-Konto](#7-datenbank--erstes-admin-konto)
8. [Domain, SSL & Reverse Proxy](#8-domain-ssl--reverse-proxy)
9. [Zeitgesteuerte Aufgabe (Cron) einrichten](#9-zeitgesteuerte-aufgabe-cron-einrichten)
10. [Updates einspielen](#10-updates-einspielen)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Voraussetzungen

| Komponente | Anforderung |
| --- | --- |
| **Node.js** | Version **≥ 20** (in Plesk unter „Node.js" auswählbar). Das Projekt legt dies auch über `engines.node` fest. |
| **Datenbank** | **Keine separate Datenbank nötig.** Es wird **SQLite** verwendet (eingebettet über `better-sqlite3`); die Daten liegen in einer Datei (siehe Abschnitt 7). Es muss also **kein** MySQL/MariaDB/PostgreSQL in Plesk angelegt werden. |
| **Plesk** | Obsidian mit installierter **Node.js-Erweiterung** (Tools & Einstellungen → Erweiterungen → „Node.js"). |
| **SSH-Zugriff** | Empfohlen. Einige Schritte (npm-Build, Admin-Anlegen, Migrationsprüfung) laufen am komfortabelsten über die **Plesk-SSH-Konsole** bzw. SSH mit dem **System­benutzer der Domain**. |
| **Domain/Subdomain** | Eine Domain oder Subdomain, unter der das Portal laufen soll. |

`better-sqlite3` ist ein **natives Modul**. Plesk liefert für gängige
Node-Versionen vorkompilierte Binärdateien; bei einem späteren Wechsel der
Node-Version muss es ggf. neu gebaut werden (siehe
[Troubleshooting](#11-troubleshooting)).

---

## 2. Architektur unter Plesk

Das Backend (Express) liefert **API und gebautes Frontend gemeinsam** aus einem
einzigen Node-Prozess aus. Passenger verbindet den Webserver (nginx/Apache) mit
diesem Prozess.

| Plesk-Feld | Wert für dieses Projekt |
| --- | --- |
| **Application Root** | Das Projektverzeichnis (das geklonte Repository), z. B. `httpdocs`. |
| **Application Startup File** | `server/src/index.js` |
| **Document Root** | `client/dist` (das gebaute Frontend; **muss ein Unterordner der Application Root sein**). |
| **Application Mode** | `production` |

Statische Dateien (JS/CSS des Frontends) liefert der Webserver direkt aus dem
Document Root aus; alle übrigen Anfragen – die API unter `/api/...` sowie die
SPA-Routen (z. B. `/organisation`) – reicht Passenger an die Node-App weiter,
die dafür `index.html` bzw. die API-Antwort liefert.

---

## 3. Code auf den Server bringen

Zwei Wege, je nach Vorliebe:

**a) Über die Plesk-Git-Integration** (Websites & Domains → „Git"): Repository
hinzufügen und in das Verzeichnis der Domain (z. B. `httpdocs`) auschecken.

**b) Über SSH** (als Systembenutzer der Domain):

```bash
# In das Domain-Verzeichnis wechseln (Pfad je nach Plesk-Konfiguration):
cd /var/www/vhosts/<domain>/httpdocs
git clone <repository-url> .
```

> Der genaue Pfad lautet üblicherweise
> `/var/www/vhosts/<domain>/httpdocs`. Der zugehörige Systembenutzer ist der
> in Plesk unter „Webhosting-Zugang" hinterlegte Benutzer der Subscription.

---

## 4. Node.js-Anwendung in Plesk einrichten

Unter **Websites & Domains → `<domain>` → Node.js**:

1. **Node.js-Version** auf ≥ 20 stellen.
2. **Application Root** auf das Projektverzeichnis setzen (z. B. `httpdocs`).
3. **Document Root** auf `client/dist` setzen (Unterordner der Application
   Root). Falls `client/dist` noch nicht existiert, zunächst
   [Abschnitt 6](#6-abhängigkeiten-installieren--frontend-bauen) ausführen und
   den Document Root danach setzen.
4. **Application Startup File** auf `server/src/index.js` setzen.
5. **Application Mode** auf `production` stellen.

Noch nicht „Restart App" klicken – zuerst Umgebungsvariablen setzen und die
Abhängigkeiten installieren.

---

## 5. Umgebungsvariablen setzen

Im selben „Node.js"-Bereich gibt es **Custom Environment Variables** (nur
Plesk für Linux). Dort als Name/Wert-Paare eintragen:

| Variable | Empfehlung / Zweck |
| --- | --- |
| `APP_TIMEZONE` | Zeitzone, z. B. `Europe/Berlin`. |
| `DATA_DIR` | Verzeichnis für SQLite-Datei, JWT-Secret und Branding-Uploads. **Empfohlen: außerhalb des Document Root**, z. B. `/var/www/vhosts/<domain>/essenportal-data`. Ohne Angabe wird `server/data` verwendet (liegt nicht im Document Root `client/dist` und ist damit ebenfalls nicht öffentlich erreichbar). |
| `VAPID_SUBJECT` | Kontakt-URL für Web-Push-Benachrichtigungen, z. B. `mailto:admin@<domain>`. |
| `JWT_SECRET` | Optional. Ohne Angabe wird beim ersten Start automatisch ein Secret erzeugt und unter `<DATA_DIR>/.jwt-secret` gespeichert. |
| `NODE_ENV` | Wird durch „Application Mode = production" automatisch gesetzt. |

`PORT` **nicht** setzen – den Wert vergibt Passenger selbst.

Die App bevorzugt echte Umgebungsvariablen; eine optionale `server/.env`
(Vorlage: [`server/.env.example`](../server/.env.example)) wird nur als
Fallback gelesen. In Plesk genügt es daher, die Variablen oben in der
Oberfläche zu setzen.

> Nach jeder Änderung der Umgebungsvariablen später **„Restart App"** klicken,
> damit sie übernommen werden.

---

## 6. Abhängigkeiten installieren & Frontend bauen

Der Plesk-Button **„NPM install"** installiert nur die Abhängigkeiten im
Application Root – für dieses Projekt reicht das nicht (Server und Client haben
eigene `package.json`). Nutze stattdessen **eine** der folgenden Varianten:

**a) Plesk-Button „Run script"** (im Node.js-Bereich): Script **`plesk:build`**
auswählen und ausführen. Es installiert Server- und Client-Abhängigkeiten und
baut das Frontend nach `client/dist`.

**b) Über SSH** (im Projektverzeichnis):

```bash
cd /var/www/vhosts/<domain>/httpdocs
npm run plesk:build
```

Falls über SSH `node`/`npm` nicht gefunden werden, den von Plesk mitgelieferten
Node-Pfad verwenden (Version anpassen):

```bash
export PATH=/opt/plesk/node/20/bin:$PATH
npm run plesk:build
```

Anschließend in Plesk unter „Node.js" den **Document Root** auf `client/dist`
setzen (falls noch nicht geschehen).

---

## 7. Datenbank & erstes Admin-Konto

**Datenbanktyp:** SQLite (Datei `app.db`). Es ist **kein** Anlegen einer
Datenbank im Plesk-Bereich „Datenbanken" nötig.

**Speicherort:** `<DATA_DIR>/app.db` – standardmäßig `server/data/app.db`, bzw.
das über `DATA_DIR` gewählte Verzeichnis. Die Datei (samt `-wal`/`-shm`) wird
beim ersten Start automatisch angelegt.

**Wichtig – Zugriffsschutz & Backup:**
- Das Datenverzeichnis darf **nicht** über die Domain erreichbar sein. Da der
  Document Root auf `client/dist` zeigt, ist `server/data` bzw. ein externes
  `DATA_DIR` bereits nicht öffentlich. Läge die Datenbank ausnahmsweise
  innerhalb des Document Root, muss der Zugriff unterbunden werden (Verzeichnis
  verschieben oder per `.htaccess`/nginx-Regel sperren).
- Das `DATA_DIR` muss dem **Systembenutzer der Domain** gehören und beschreibbar
  sein.
- Das `DATA_DIR` in die **Plesk-Backups** einschließen (bei einem Pfad innerhalb
  des Domain-Verzeichnisses automatisch abgedeckt).

**Migrationen:** laufen **automatisch beim Serverstart** (additiv, nicht
destruktiv) – kein manueller Schritt nötig.

**Erstes Admin-Konto anlegen** (ohne Demo-Daten) – über SSH:

```bash
cd /var/www/vhosts/<domain>/httpdocs
# DATA_DIR nur nötig, wenn du es oben gesetzt hast (muss zum App-Wert passen):
DATA_DIR=/var/www/vhosts/<domain>/essenportal-data \
  npm run create-admin --prefix server -- admin 'EinStarkesPasswort' Administrator
```

Danach unter der Domain anmelden (`admin` / gewähltes Passwort) und das Passwort
ändern sowie die echten Benutzer anlegen.

> Alternativ legt `npm run seed --prefix server` **Demo-Daten** an (Benutzer
> `admin`/`admin123`, Beispiel-Restaurants und -Tage). Für den Produktivbetrieb
> ist `create-admin` vorzuziehen.

---

## 8. Domain, SSL & Reverse Proxy

- **Subdomain/Domain:** In Plesk unter „Websites & Domains" die gewünschte
  (Sub-)Domain anlegen und wie oben die Node.js-App darauf einrichten.
- **SSL/TLS (Let's Encrypt):** Unter `<domain>` → **„SSL/TLS-Zertifikate"** ein
  kostenloses **Let's Encrypt**-Zertifikat ausstellen und „Sicheres HTTPS"
  aktivieren (Weiterleitung von HTTP auf HTTPS).
- **Reverse Proxy:** **Nicht nötig.** Passenger übernimmt die Weiterleitung von
  nginx/Apache an die Node-App automatisch. Die App erkennt HTTPS über den von
  Plesk gesetzten `X-Forwarded-Proto`-Header und sendet dann automatisch den
  HSTS-Header. (Die Anzahl vertrauenswürdiger Proxy-Hops lässt sich bei Bedarf
  über die Variable `TRUST_PROXY_HOPS` anpassen, Standard 1.)

---

## 9. Zeitgesteuerte Aufgabe (Cron) einrichten

Die App leitet Phasenwechsel bei jedem Zugriff ab und besitzt einen internen
Timer. Unter Passenger kann die App aber bei **Inaktivität heruntergefahren**
werden, sodass der Timer pausiert. Damit **automatische Tagesplanung**,
**Phasenwechsel** und **Push-Benachrichtigungen** auch ohne Besucher zuverlässig
laufen, richte eine zeitgesteuerte Aufgabe ein, die den Wartungs-Task
[`server/src/tasks.js`](../server/src/tasks.js) ausführt.

Unter **Websites & Domains → `<domain>` → Zeitgesteuerte Aufgaben** →
**Aufgabe hinzufügen**, Typ **„Einen Befehl ausführen"**:

```bash
DATA_DIR=/var/www/vhosts/<domain>/essenportal-data APP_TIMEZONE=Europe/Berlin VAPID_SUBJECT=mailto:admin@<domain> /opt/plesk/node/20/bin/node /var/www/vhosts/<domain>/httpdocs/server/src/tasks.js
```

**Wichtig:**
- Plesk reicht die oben gesetzten Custom Environment Variables **nicht** an
  zeitgesteuerte Aufgaben durch – deshalb `DATA_DIR`/`APP_TIMEZONE`/
  `VAPID_SUBJECT` hier **direkt im Befehl** voranstellen (dieselben Werte wie in
  der App).
- Den **vollständigen Node-Pfad** verwenden (`/opt/plesk/node/<version>/bin/node`).
  Die installierten Versionen zeigt `ls /opt/plesk/node/`.
- **Intervall:** alle **5–15 Minuten** empfohlen (zeitnahe Phasenwechsel und
  Push-Hinweise). Cron-Ausdruck z. B. `*/10 * * * *`.
  Wer nur die automatische Tagesplanung braucht, kann auch werktags morgens
  laufen lassen (z. B. `0 7 * * 1-5`) – dann sind Push-Hinweise zum
  Bestellschluss aber nur so genau wie das Intervall.

---

## 10. Updates einspielen

Über SSH als Systembenutzer der Domain:

```bash
cd /var/www/vhosts/<domain>/httpdocs
git pull
npm run plesk:build     # Server-/Client-Abhängigkeiten aktualisieren + Frontend neu bauen
```

Danach die App neu starten – entweder in Plesk über den Button **„Restart App"**
oder über SSH durch Anlegen der Neustart-Markierung:

```bash
touch /var/www/vhosts/<domain>/tmp/restart.txt
```

Datenbank-Migrationen laufen beim nächsten Start automatisch. Bestehende Daten
(Benutzer, Restaurants/Speisekarten, Bestellhistorie, Branding) bleiben
erhalten. Ein Backup vor dem Update lässt sich über die Plesk-Backup-Funktion
oder durch Kopieren des `DATA_DIR` erstellen.

---

## 11. Troubleshooting

| Symptom | Ursache & Lösung |
| --- | --- |
| **„The file does not exist" beim Startup File** | Der Pfad `server/src/index.js` muss **relativ zur Application Root** existieren. Application Root prüfen; ggf. wurde das Repo in einen Unterordner geklont. |
| **App startet nicht / 502 / Passenger-Fehlerseite** | Wurde `npm run plesk:build` ausgeführt? `server/node_modules` und `client/dist` müssen existieren. Danach „Restart App". Logs prüfen (siehe unten). |
| **`better-sqlite3 ... compiled against a different Node.js version`** | Node-Version wurde gewechselt. Modul mit der **aktuellen** Version neu bauen: `cd .../httpdocs && export PATH=/opt/plesk/node/<version>/bin:$PATH && npm rebuild better-sqlite3 --prefix server`, dann „Restart App". |
| **Umgebungsvariablen wirken nicht** | Nach dem Setzen **„Restart App"** klicken (Passenger übernimmt sie erst beim Neustart). |
| **`create-admin`/Cron schreibt in die falsche Datenbank** | `DATA_DIR` muss überall **identisch** sein: in den App-Umgebungsvariablen **und** im Cron-Befehl. Ohne `DATA_DIR` gilt jeweils `server/data`. |
| **Cron: „no node binary in the current PATH"** | Vollständigen Node-Pfad verwenden: `/opt/plesk/node/<version>/bin/node`. Umgebungsvariablen im Befehl voranstellen (werden nicht durchgereicht). |
| **Schreibrechte-Fehler auf die Datenbank** | `DATA_DIR` muss dem Systembenutzer der Domain gehören und beschreibbar sein: `chown -R <sysuser>:psacln <DATA_DIR>`. |
| **SPA-Route (z. B. `/organisation`) liefert 404** | Node.js für die Domain aktiv? Document Root = `client/dist`? Nicht gefundene Dateien reicht Passenger an die App, die `index.html` ausliefert. |
| **Push-Benachrichtigungen funktionieren nicht** | Web Push braucht **HTTPS** (Let's Encrypt aktivieren). `VAPID_SUBJECT` in App **und** Cron setzen. Nutzer müssen unter „Einstellungen" zustimmen. Ohne `web-push`-Abhängigkeit (unwahrscheinlich nach `plesk:build`) bleibt Push deaktiviert; die Hinweise erscheinen dann im Portal. |
| **Logs finden** | Node-Ausgaben (stdout/stderr) und Passenger-Fehler stehen in den Domain-Logs: Plesk → `<domain>` → **„Logs"** bzw. im Dateisystem unter `/var/www/vhosts/<domain>/logs/`. |

---

Siehe auch: [README](../README.md) · [Datenbankmodell](datenbankmodell.md) ·
[API-Endpunkte](api-endpunkte.md) · [SSO](sso-entra-id.md).
