# NIGEFA Essensbestellung 🍽️

Moderne, responsive Webanwendung zur Organisation täglicher Essensbestellungen in Teams und Unternehmen.

Mitarbeiter stimmen jeden Tag in **zwei Phasen** ab: zuerst über das Restaurant bzw. den Lieferdienst (Phase 1), anschließend bestellt jeder sein konkretes Gericht beim Gewinner-Restaurant (Phase 2). Administratoren planen die Tage, Organisatoren wickeln die Bestellung ab.

## Features

- **Zwei-Phasen-Abstimmung** mit konfigurierbaren Fristen (z. B. 10:00 Uhr Restaurant-Wahl, 11:30 Uhr Essensbestellung)
- **Konfigurierbare Gleichstands-Logik**: automatische Stichwahl oder Admin-Entscheidung
- **Rollen**: Benutzer, Organisator (pro Tag), Administrator (RBAC)
- **Tagesplanung**: Wochenvorlagen je Wochentag + individuelle Kalendertage
- **Bestellungen** mit Menge und Bemerkung („ohne Zwiebeln"), persönliche Historie
- **Benachrichtigungen**: In-App, E-Mail und optional Web-Push (Phasenstart, Erinnerungen, Gewinner, Organisator-Erinnerung)
- **Admin-Dashboard** mit Kennzahlen: aktive Benutzer, Teilnehmerquote, beliebteste Restaurants & Gerichte, Verlauf
- **Export** der Tagesbestellung als PDF oder Excel
- **Audit-Log** aller Administrator-Aktionen, DSGVO-konforme Speicherung (Anonymisierung statt Löschung)
- **Dark Mode**, **responsive** (Desktop & Mobile), **mehrsprachig** (Deutsch/Englisch)
- **OpenAPI/Swagger**-Dokumentation, Docker-Support, CI/CD-Pipeline

## Tech-Stack

| Schicht | Technologie |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query |
| Backend | NestJS, TypeScript, TypeORM, Repository Pattern |
| Datenbank | PostgreSQL 16 |
| Auth | JWT (Access + Refresh Token), bcrypt, RBAC |
| Infrastruktur | Docker & Docker Compose, GitHub Actions CI/CD |
| E-Mail | Nodemailer (SMTP), MailHog für die lokale Entwicklung |

## Schnellstart (Docker)

```bash
cp .env.example .env          # Secrets anpassen!
docker compose up -d --build  # DB + Backend + Frontend + MailHog
docker compose exec backend node dist/database/seeds/seed.js   # Demodaten
```

| Dienst | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend-API | http://localhost:4000/api/v1 |
| Swagger-Doku | http://localhost:4000/api/docs |
| MailHog (E-Mails) | http://localhost:8025 |

**Demo-Zugänge** (nach dem Seed):

| Rolle | E-Mail | Passwort |
|---|---|---|
| Administrator | `admin@nigefa.de` | `Admin123!` |
| Organisator (heute) | `orga@nigefa.de` | `User123!` |
| Benutzer | `max@nigefa.de` | `User123!` |

## Lokale Entwicklung (ohne Docker für die Apps)

```bash
docker compose up -d db mailhog        # nur DB + MailHog
cd backend && npm install && npm run start:dev    # http://localhost:4000
cd frontend && npm install && npm run dev         # http://localhost:3000
cd backend && npm run seed             # Demodaten einspielen
```

## Ordnerstruktur

```
.
├── backend/                  # NestJS-API (Clean Architecture, Repository Pattern)
│   ├── src/
│   │   ├── common/           # Guards, Decorators, Filters, Utils (RBAC, Zeit)
│   │   ├── config/           # Konfiguration & Validierung
│   │   ├── database/         # Entities, DataSource, Seeds
│   │   └── modules/          # Fachmodule: auth, users, restaurants, planning,
│   │                         # voting, orders, notifications, stats, settings,
│   │                         # audit, scheduler, health
│   └── test/                 # E2E-/Integrationstests
├── frontend/                 # Next.js-App (App Router)
│   └── src/
│       ├── app/              # Routen: Heute, Historie, Organisator, Admin …
│       ├── components/       # UI-Komponenten (Design-System + Fachkomponenten)
│       └── lib/              # API-Client, Auth, i18n (de/en), Hooks
├── docs/                     # Architektur, ERD, SQL-Schema, API-Spec, Konzepte
├── .github/workflows/        # CI/CD-Pipeline
└── docker-compose.yml
```

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/01-architektur.md](docs/01-architektur.md) | Software-Architektur, Schichten, Abstimmungs-Zustandsmaschine, Scheduler |
| [docs/02-datenmodell-erd.md](docs/02-datenmodell-erd.md) | Entity-Relationship-Diagramm + Entitätsbeschreibung |
| [docs/03-datenbank-schema.sql](docs/03-datenbank-schema.sql) | Vollständiges PostgreSQL-DDL |
| [docs/04-api-spezifikation.md](docs/04-api-spezifikation.md) | REST-API mit allen Endpunkten und Beispielen |
| [docs/05-frontend-konzept.md](docs/05-frontend-konzept.md) | Seiten, Routing, State-Management, i18n |
| [docs/06-ui-ux-konzept.md](docs/06-ui-ux-konzept.md) | Design-System, Flows, Responsive Design, Dark Mode |
| [docs/07-deployment.md](docs/07-deployment.md) | Deployment-Anleitung (Docker, Produktion, CI/CD, Backups) |

## Tests

```bash
cd backend
npm run test          # Unit-Tests (Voting-Logik, Auth, Bestellungen …)
npm run test:e2e      # Integrationstests (benötigt laufende PostgreSQL, s. docs/07)
cd ../frontend
npm run lint && npm run build
```

## Lizenz

Internes Projekt der NIGEFA. Alle Rechte vorbehalten.
