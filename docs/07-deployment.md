# Deployment-Anleitung — NIGEFA Essensbestellung

## 1. Voraussetzungen

- Docker ≥ 24 mit Compose-Plugin (empfohlen) — oder Node.js ≥ 20 + PostgreSQL 16 für den Betrieb ohne Container
- Für Produktion: eine Domain + Reverse Proxy mit TLS (Caddy, nginx oder Traefik)

## 2. Konfiguration (Umgebungsvariablen)

`cp .env.example .env` und anpassen. Wichtige Variablen:

| Variable | Standard | Beschreibung |
|---|---|---|
| `POSTGRES_USER/PASSWORD/DB` | `nigefa` / `nigefa` / `nigefa` | Zugangsdaten der Datenbank (Compose) |
| `DB_HOST/DB_PORT` | `db` / `5432` | DB-Adresse aus Sicht des Backends |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | **Pflicht in Produktion**: lange Zufallswerte (`openssl rand -hex 48`) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `7d` | Token-Laufzeiten |
| `APP_URL` | `http://localhost:3000` | Frontend-Origin (CORS + Links in E-Mails) |
| `SMTP_HOST/PORT/USER/PASS/SECURE` | MailHog (`mailhog:1025`) | SMTP-Server für E-Mails |
| `MAIL_FROM` | `Essensbestellung <noreply@nigefa.de>` | Absender |
| `SCHEDULER_ENABLED` | `true` | Cron-Jobs (bei mehreren Backend-Replikaten nur auf einer Instanz `true`) |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | leer | optional: Web-Push (`npx web-push generate-vapid-keys`) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | API-URL, wird **beim Frontend-Build** eingebacken |

Fachliche Einstellungen (Fristen 10:00/11:30, Gleichstands-Strategie, Stichwahl-Dauer, Erinnerungsvorlauf, Zeitzone) werden **in der App** unter *Admin → Einstellungen* gepflegt (Tabelle `app_settings`), nicht per Env.

## 3. Lokales Deployment / Evaluierung

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend node dist/database/seeds/seed.js   # Demodaten (idempotent)
```

- Frontend: http://localhost:3000 · API/Swagger: http://localhost:4000/api/docs · MailHog: http://localhost:8025
- Demo-Logins: siehe [README](../README.md).
- Logs: `docker compose logs -f backend` · Stoppen: `docker compose down` (Daten bleiben im Volume `db-data`).

## 4. Produktions-Deployment (Single Server)

### 4.1 Images bauen

Die CI baut Images automatisch (s. u.). Manuell:

```bash
docker build -t nigefa-backend:1.0.0 ./backend
docker build -t nigefa-frontend:1.0.0 \
  --build-arg NEXT_PUBLIC_API_URL=https://essen.nigefa.de/api/v1 ./frontend
```

> ⚠️ `NEXT_PUBLIC_API_URL` ist ein **Build-Argument** — bei Domainwechsel Frontend neu bauen.

### 4.2 Compose für Produktion

`docker-compose.yml` verwenden und in `.env` setzen: starke `JWT_*`-Secrets und DB-Passwörter, `APP_URL=https://essen.nigefa.de`, echten SMTP (`SMTP_HOST=smtp.example.com`, `SMTP_PORT=587`, `SMTP_USER/PASS`, `SMTP_SECURE=false` bei STARTTLS), MailHog-Service entfernen/deaktivieren.

### 4.3 Reverse Proxy (TLS)

Beispiel **Caddy** (`Caddyfile`) — terminiert TLS automatisch via Let's Encrypt:

```
essen.nigefa.de {
    handle /api/* {
        reverse_proxy backend:4000
    }
    handle {
        reverse_proxy frontend:3000
    }
}
```

Äquivalent mit nginx: `location /api/ { proxy_pass http://backend:4000; }` und `location / { proxy_pass http://frontend:3000; }` plus Certbot. Frontend und Backend teilen sich so eine Origin → `NEXT_PUBLIC_API_URL=https://essen.nigefa.de/api/v1` und `APP_URL=https://essen.nigefa.de`.

### 4.4 Erststart

```bash
docker compose up -d
docker compose exec backend node dist/database/seeds/seed.js   # optional: Demodaten
# ODER ohne Seed: die ERSTE Registrierung über die UI erhält automatisch die ADMIN-Rolle.
```

Danach unter *Admin → Einstellungen* Zeitzone/Fristen prüfen, Restaurants + Wochenvorlage anlegen.

## 5. Datenbank-Schema & Migrationen

- In Entwicklung und für die Ersteinrichtung erzeugt TypeORM das Schema automatisch (`DB_SYNCHRONIZE=true`, Standard im Compose-Setup). Das Referenz-DDL liegt in [03-datenbank-schema.sql](03-datenbank-schema.sql).
- Für streng versionierte Produktionsumgebungen: `DB_SYNCHRONIZE=false` setzen und Migrationen verwenden:

```bash
cd backend
npm run migration:generate --name=beschreibung   # aus Entity-Änderungen erzeugen
npm run migration:run                            # anwenden (nutzt .env)
```

## 6. Betrieb

| Thema | Vorgehen |
|---|---|
| **Backups** | `docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%F).sql` (per Cron täglich); Restore mit `psql` |
| **Healthchecks** | `GET /health` (prüft DB); Compose-Healthchecks sind konfiguriert — Orchestratoren können darauf reagieren |
| **Logs** | stdout/stderr der Container (`docker compose logs`), bei Bedarf an Loki/ELK anbinden |
| **Updates** | neue Images bauen/pullen → `docker compose up -d` (DB-Volume bleibt erhalten) |
| **Skalierung** | Backend-Replikate möglich; dann `SCHEDULER_ENABLED=true` nur auf genau einer Instanz |
| **Zeitzone** | Fristen werden in der App-Zeitzone (Standard `Europe/Berlin`) berechnet — Serverzeit muss nur UTC-korrekt sein (NTP) |

## 7. CI/CD-Pipeline (GitHub Actions)

Workflow [.github/workflows/ci.yml](../.github/workflows/ci.yml), läuft bei jedem Push/PR:

1. **Backend**: `npm ci` → ESLint → Build → Unit-Tests → **Integrationstests gegen echte PostgreSQL** (Service-Container)
2. **Frontend**: `npm ci` → ESLint → `next build` (inkl. Typprüfung)
3. **Docker**: beide Images werden gebaut; auf dem `main`-Branch zusätzlich nach **GHCR** gepusht (`ghcr.io/<owner>/<repo>-backend|-frontend`, Tags `latest` + Commit-SHA)

**Continuous Deployment** (optional aktivierbar): auf dem Zielserver per SSH-Step `docker compose pull && docker compose up -d` ausführen oder Watchtower auf die GHCR-Images zeigen lassen. Der dafür vorbereitete (auskommentierte) `deploy`-Job im Workflow benötigt die Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.

## 8. Checkliste Produktion

- [ ] Starke `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` und DB-Passwörter gesetzt
- [ ] `APP_URL` + `NEXT_PUBLIC_API_URL` auf die echte Domain gestellt (Frontend neu gebaut)
- [ ] TLS am Reverse Proxy aktiv; nur Ports 80/443 öffentlich (DB/SMTP intern)
- [ ] Echter SMTP-Server konfiguriert, MailHog entfernt
- [ ] Tägliche DB-Backups eingerichtet und Restore einmal getestet
- [ ] Erster Admin angelegt, Demo-Konten deaktiviert/gelöscht (falls Seed benutzt wurde)
- [ ] Zeitzone & Fristen in *Admin → Einstellungen* geprüft
- [ ] Optional: VAPID-Keys für Web-Push erzeugt und gesetzt
