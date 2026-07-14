# 🍽️ Essensbestellung

Moderne Webanwendung zur Organisation täglicher Essensbestellungen im Team – mit
**Zwei-Phasen-Abstimmung**: Erst wählt das Team das Restaurant, dann bestellt jeder sein
Gericht. Phasenwechsel passieren **automatisch** zu den vom Administrator festgelegten
Uhrzeiten.

![Heute – Phase 1](docs/screenshots/02-heute-phase1.png)

## Funktionsweise

**Phase 1 – Restaurantwahl:** Der Admin plant für jeden Tag die zur Wahl stehenden
Restaurants, den Organisator und die Abstimmungszeiten. Bis zum Ende von Phase 1 stimmt
jeder Mitarbeiter für ein Restaurant (Stimme jederzeit änderbar). Nach Ablauf gewinnt
automatisch das Restaurant mit den meisten Stimmen (bei Gleichstand die zuerst gelistete
Option).

**Phase 2 – Essensauswahl:** Direkt im Anschluss wird die Speisekarte des Gewinners
freigeschaltet. Bis zum Bestellschluss wählt jeder sein Gericht und kann eine Bemerkung
hinterlassen („ohne Zwiebeln“). Danach ist der Tag abgeschlossen.

**Organisation:** Der für den Tag bestimmte Organisator sieht die vollständige
Bestellübersicht – als nach Gerichten gruppierte Sammelbestellung mit Summen und als
Einzelliste – und pflegt den Bestellstatus (Eingegangen → Bestellt → Geliefert,
Storniert; einzeln oder als Sammelaktion).

## Rollen

| Rolle | Möglichkeiten |
| --- | --- |
| **Benutzer** | Anmelden, an beiden Abstimmungen teilnehmen, eigenes Essen wählen, eigene Bestellungen einsehen |
| **Organisator** | Zusätzlich (für „seinen“ Tag): alle Bestellungen einsehen, Bestellstatus verwalten, Sammelbestellung |
| **Administrator** | Benutzer, Restaurants und Speisekarten verwalten, Tagesplanung (Restaurants, Organisator, Zeiten je Tag), Standardzeiten konfigurieren, alle Ergebnisse einsehen |

## Tech-Stack

- **Frontend:** React 18 + Vite, React Router, responsives CSS (Desktop & Mobil)
- **Backend:** Node.js + Express, JWT-Authentifizierung, bcrypt-Passwort-Hashing
- **Datenbank:** SQLite (better-sqlite3) – ohne externe Dienste sofort lauffähig

## Schnellstart

Voraussetzung: Node.js ≥ 20.

```bash
npm run setup   # installiert Root-, Server- und Client-Abhängigkeiten
npm run seed    # legt Demo-Daten an (Benutzer, Restaurants, Beispieltage)
npm run dev     # startet Backend (Port 3001) und Frontend (Port 5173)
```

Anschließend <http://localhost:5173> öffnen und anmelden:

| Benutzername | Passwort | Rolle |
| --- | --- | --- |
| `admin` | `admin123` | Administrator |
| `anna` | `passwort123` | Benutzerin (heute Organisatorin) |
| `ben` | `passwort123` | Benutzer (Organisator des Beispieltags von gestern) |
| `clara` | `passwort123` | Benutzerin |

Der Seed legt einen laufenden Tag in Phase 1 sowie einen abgeschlossenen Vortag mit
Bestellungen an. Liegen die Standardzeiten (10:30/11:45) beim Seeden bereits in der
Vergangenheit, werden die Demo-Deadlines automatisch relativ zur aktuellen Uhrzeit
gesetzt, damit Phase 1 aktiv ist.

**Produktionsbetrieb:**

```bash
npm run build   # baut das Frontend nach client/dist
npm start       # Express liefert API + Frontend gemeinsam auf Port 3001 aus
```

Konfiguration über Umgebungsvariablen: `PORT` (Standard 3001), `JWT_SECRET`
(sonst automatisch generiert und in `server/data/` abgelegt), `APP_TIMEZONE`
(Standard `Europe/Berlin`).

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [docs/datenbankmodell.md](docs/datenbankmodell.md) | Tabellen, ER-Diagramm, Statuslogik der Phasen |
| [docs/seitenkonzept.md](docs/seitenkonzept.md) | Alle Seiten, Abläufe und Berechtigungen |
| [docs/api-endpunkte.md](docs/api-endpunkte.md) | REST-API-Referenz mit Beispielen |

## Projektstruktur

```
├── server/                  Node.js/Express-Backend
│   └── src/
│       ├── index.js         App-Setup, Routen-Mounting, statisches Frontend
│       ├── db.js            SQLite-Schema und -Zugriff
│       ├── auth.js          JWT-Erstellung, Auth-/Admin-Middleware
│       ├── dayLogic.js      Phasenübergänge & Gewinnerermittlung
│       ├── util.js          Zeitzonen-Helfer (Europe/Berlin)
│       ├── seed.js          Demo-Daten
│       └── routes/          auth, users, restaurants, days, my, settings
├── client/                  React-Frontend (Vite)
│   └── src/
│       ├── App.jsx          Routing inkl. Rollen-Guards
│       ├── api.js           Fetch-Wrapper mit Token-Handling
│       ├── auth/            AuthContext (Login/Session)
│       ├── components/      Layout (Navigation), Countdown
│       └── pages/           Login, Heute, Meine Bestellungen, Organisation,
│                            admin/ (Tagesplanung, Restaurants, Benutzer)
└── docs/                    Konzepte, API-Referenz, Screenshots
```

## Wichtige Implementierungsdetails

- **Automatische Phasenwechsel:** Der Status eines Tages wird bei jedem Zugriff und
  zusätzlich alle 30 Sekunden aus den Deadlines abgeleitet; der Gewinner wird beim
  Übergang eingefroren. Kein Cron, keine externen Abhängigkeiten.
- **Live-Erlebnis im Frontend:** Die „Heute“-Seite pollt alle 15 Sekunden, der Countdown
  gleicht sich über `serverNow` mit der Server-Uhr ab und lädt beim Ablauf sofort neu –
  der Phasenwechsel erscheint ohne manuelles Neuladen.
- **Eine Stimme / eine Bestellung pro Tag** wird per UNIQUE-Constraint in der Datenbank
  garantiert; erneutes Abstimmen/Bestellen aktualisiert per Upsert.
- **Historie bleibt erhalten:** Restaurants und Gerichte, die bereits verwendet wurden,
  werden beim „Löschen“ deaktiviert statt entfernt.
- **Sicherheit:** bcrypt-Hashes, JWT mit 12 h Laufzeit, rollenbasierte Middleware,
  Organisator-Rechte gelten nur für den jeweils zugewiesenen Tag.

## Screenshots

| | |
| --- | --- |
| ![Login](docs/screenshots/01-login.png) | ![Organisation](docs/screenshots/04-organisation.png) |
| ![Tagesplanung](docs/screenshots/05-admin-tagesplanung.png) | <img src="docs/screenshots/03-heute-mobil.png" alt="Mobilansicht" width="260"> |
