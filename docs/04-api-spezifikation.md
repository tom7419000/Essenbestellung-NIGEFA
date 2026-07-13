# API-Spezifikation — NIGEFA Essensbestellung

REST-API. Diese Datei ist der **verbindliche Vertrag** zwischen Frontend und Backend. Die maschinenlesbare OpenAPI-Definition wird vom Backend generiert: Swagger-UI unter **`/api/docs`**, JSON unter **`/api/docs-json`**.

## Konventionen

- **Base-URL:** `http://localhost:4000/api/v1`
- **Auth:** `Authorization: Bearer <accessToken>` — alle Endpunkte außer den mit 🌐 markierten.
- **Rollen:** 👤 = angemeldeter Benutzer, 🛡️ = nur `ADMIN`, 📋 = Organisator des jeweiligen Tages **oder** Admin.
- **Zeitstempel:** ISO 8601 mit Zeitzone (`2026-07-13T08:00:00.000Z`); Kalendertage als `YYYY-MM-DD`; Uhrzeiten der Konfiguration als `"HH:mm"`.
- **Preise:** Zahlen mit 2 Dezimalstellen (Euro).
- **Fehlerformat:** `{ "statusCode": 400, "message": "..." | ["feld1 ...", ...], "error": "Bad Request" }`
- **Paginierung:** `?page=1&limit=20` → Antwort `{ "items": [...], "total": 123, "page": 1, "limit": 20 }`

## Gemeinsame Objekte

```jsonc
// User
{
  "id": "uuid", "email": "max@nigefa.de",
  "firstName": "Max", "lastName": "Muster",
  "role": "USER",                  // "ADMIN" | "USER"
  "locale": "de",                  // "de" | "en"
  "isActive": true,
  "emailNotifications": true, "pushNotifications": false,
  "createdAt": "2026-07-01T09:00:00.000Z"
}

// UserPublic (eingebettet in andere Objekte)
{ "id": "uuid", "firstName": "Max", "lastName": "Muster", "email": "max@nigefa.de" }

// Restaurant
{
  "id": "uuid", "name": "Pizzeria Roma", "description": "Italienisch, Holzofen",
  "cuisine": "Italienisch", "phone": "+49 30 123456",
  "website": "https://...", "menuUrl": "https://.../menu.json",
  "isActive": true, "createdAt": "..."
}

// MenuItem
{
  "id": "uuid", "restaurantId": "uuid",
  "name": "Pizza Margherita", "description": "Tomate, Mozzarella, Basilikum",
  "price": 8.5, "category": "Pizza", "isAvailable": true
}

// DayPlanStatus (Zustandsmaschine)
"SCHEDULED" | "VOTING_OPEN" | "RUNOFF_VOTING" | "TIE_ADMIN_DECISION" |
"ORDERING_OPEN" | "ORDERING_CLOSED" | "ORDERED" | "DELIVERED" | "CANCELLED"

// DayPlanDetail — zentrales Objekt der Tagesansicht
{
  "id": "uuid",
  "date": "2026-07-13",
  "status": "VOTING_OPEN",
  "voteDeadline": "2026-07-13T08:00:00.000Z",
  "orderDeadline": "2026-07-13T09:30:00.000Z",
  "runoffDeadline": null,                    // gesetzt bei RUNOFF_VOTING
  "tieBreakStrategy": "RUNOFF",              // "RUNOFF" | "ADMIN_DECISION"
  "organizer": { /* UserPublic */ } | null,
  "organizerNote": null,
  "options": [                               // Restaurants zur Wahl inkl. Live-Ergebnis
    { "restaurantId": "uuid", "name": "Pizzeria Roma", "cuisine": "Italienisch",
      "description": "...", "voteCount": 5, "isRunoffCandidate": false }
  ],
  "winnerRestaurant": null | {               // ab ORDERING_OPEN inkl. Speisekarte
    "id": "uuid", "name": "...", "cuisine": "...", "description": "...",
    "menuItems": [ /* MenuItem, nur isAvailable=true */ ]
  },
  "myVote": null | { "restaurantId": "uuid" },        // Stimme im Hauptwahlgang
  "myRunoffVote": null | { "restaurantId": "uuid" },  // Stimme in der Stichwahl
  "myOrders": [ /* OrderLine */ ],
  "totalVotes": 12,                          // Stimmen im aktuellen Wahlgang
  "totalOrders": 9                           // Anzahl Besteller
}

// DayPlanLite (Listenansicht)
{
  "id": "uuid", "date": "2026-07-13", "status": "ORDERED",
  "voteDeadline": "...", "orderDeadline": "...",
  "organizer": { /* UserPublic */ } | null,
  "winnerRestaurant": { "id": "uuid", "name": "Pizzeria Roma" } | null,
  "totalVotes": 12, "totalOrders": 9
}

// OrderLine
{
  "id": "uuid",
  "menuItem": { /* MenuItem */ },
  "quantity": 2, "note": "ohne Zwiebeln",
  "priceAtOrder": 8.5,
  "createdAt": "...", "updatedAt": "..."
}

// Notification
{
  "id": "uuid", "type": "WINNER_ANNOUNCED",
  "title": "Pizzeria Roma hat gewonnen!",
  "message": "Die Essensbestellung läuft bis 11:30 Uhr.",
  "dayPlanId": "uuid" | null, "readAt": null, "createdAt": "..."
}
```

---

## 1. Auth (`/auth`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `POST /auth/register` | 🌐 | Registrierung. **Der erste registrierte Benutzer wird automatisch ADMIN.** |
| `POST /auth/login` | 🌐 | Login mit E-Mail + Passwort |
| `POST /auth/refresh` | 🌐 | Access Token erneuern (Refresh-Token-Rotation) |
| `POST /auth/logout` | 👤 | Refresh Token widerrufen |
| `GET /auth/me` | 👤 | Eigenes Profil |

```jsonc
// POST /auth/register  — Request
{ "email": "max@nigefa.de", "password": "User123!", "firstName": "Max", "lastName": "Muster", "locale": "de" }
// POST /auth/login — Request
{ "email": "max@nigefa.de", "password": "User123!" }
// Antwort von register/login/refresh (201/200):
{ "user": { /* User */ }, "accessToken": "eyJ...", "refreshToken": "eyJ..." }
// POST /auth/refresh & /auth/logout — Request
{ "refreshToken": "eyJ..." }
```

Passwort-Policy: min. 8 Zeichen, mind. 1 Buchstabe und 1 Ziffer. 401 bei falschen Zugangsdaten oder deaktiviertem Konto.

## 2. Benutzer (`/users`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /users?search=&page=&limit=` | 🛡️ | Benutzerliste (Suche über Name/E-Mail) |
| `POST /users` | 🛡️ | Benutzer anlegen `{ email, firstName, lastName, password, role?, locale? }` |
| `PATCH /users/:id` | 🛡️ | Ändern `{ firstName?, lastName?, role?, isActive?, locale? }` |
| `POST /users/:id/reset-password` | 🛡️ | `{ "newPassword": "..." }` |
| `DELETE /users/:id` | 🛡️ | **DSGVO-Anonymisierung** (kein Hard-Delete; Historie bleibt anonym erhalten) |
| `PATCH /users/me` | 👤 | Eigenes Profil `{ firstName?, lastName?, locale?, emailNotifications?, pushNotifications? }` |
| `PATCH /users/me/password` | 👤 | `{ "currentPassword": "...", "newPassword": "..." }` |

`GET /users` unterstützt zusätzlich `?all=true` (ohne Paginierung, nur aktive Benutzer, reduzierte Felder) für Auswahllisten (Organisator-Zuweisung).

## 3. Restaurants & Speisekarten (`/restaurants`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /restaurants?includeInactive=true` | 👤 (inactive nur 🛡️) | Alle Restaurants, alphabetisch |
| `GET /restaurants/:id` | 👤 | Detail **inkl. `menuItems`** |
| `POST /restaurants` | 🛡️ | `{ name, description?, cuisine?, phone?, website?, menuUrl? }` |
| `PATCH /restaurants/:id` | 🛡️ | Felder wie POST + `isActive?` |
| `DELETE /restaurants/:id` | 🛡️ | Deaktiviert das Restaurant (Soft-Delete), wenn es bereits verwendet wurde; sonst hartes Löschen |
| `POST /restaurants/:id/menu-items` | 🛡️ | `{ name, description?, price, category?, isAvailable? }` |
| `PATCH /restaurants/:id/menu-items/:itemId` | 🛡️ | Felder wie POST |
| `DELETE /restaurants/:id/menu-items/:itemId` | 🛡️ | Löscht Gericht (bzw. setzt `isAvailable=false`, wenn bereits bestellt) |
| `POST /restaurants/:id/import-menu` | 🛡️ | Import von `menuUrl` (oder `{ "url": "..." }` im Body). Erwartetes Format s. u. |

```jsonc
// Generisches Menü-Import-Format (Adapter für Lieferdienst-APIs)
{ "items": [ { "name": "Pizza Funghi", "description": "...", "price": 9.0, "category": "Pizza" } ] }
// Antwort: { "imported": 12, "updated": 3 }
```

## 4. Tagespläne (`/day-plans`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /day-plans/today` | 👤 | **`DayPlanDetail`** für heute (`404`, wenn kein Plan existiert) |
| `GET /day-plans?from=&to=` | 👤 | `DayPlanLite[]` im Zeitraum (Standard: letzte 30 Tage bis +7 Tage) |
| `GET /day-plans/:id` | 👤 | `DayPlanDetail` |
| `POST /day-plans` | 🛡️ | Plan anlegen (s. u.) |
| `PATCH /day-plans/:id` | 🛡️ | Plan ändern (nur vor `ORDERING_CLOSED`) |
| `DELETE /day-plans/:id` | 🛡️ | Nur `SCHEDULED`/`CANCELLED`-Pläne |
| `POST /day-plans/generate` | 🛡️ | `{ "date": "YYYY-MM-DD" }` — aus Wochenvorlage erzeugen |
| `POST /day-plans/:id/open-voting` | 🛡️ | Abstimmung manuell öffnen |
| `POST /day-plans/:id/close-voting` | 🛡️ | Abstimmung manuell schließen (löst Auszählung & Gleichstands-Logik aus) |
| `POST /day-plans/:id/close-ordering` | 🛡️ | Bestellphase manuell schließen |
| `POST /day-plans/:id/reopen-ordering` | 🛡️ | `ORDERING_CLOSED` → `ORDERING_OPEN` (Nachzügler) |
| `POST /day-plans/:id/decide-winner` | 🛡️ | `{ "restaurantId": "uuid" }` — bei `TIE_ADMIN_DECISION` (oder Korrektur in `ORDERING_OPEN`) |
| `POST /day-plans/:id/cancel` | 🛡️ | Tag absagen |
| `PATCH /day-plans/:id/order-status` | 📋 | `{ "status": "ORDERED" \| "DELIVERED", "note"?: "..." }` — Organisator-Workflow |
| `GET /day-plans/:id/votes` | 🛡️ | Alle Einzelstimmen `[{ user: UserPublic, restaurant: {id,name}, isRunoffVote, createdAt }]` |
| `GET /day-plans/:id/summary` | 📋 | Bestell-Zusammenfassung (s. u.) |
| `GET /day-plans/:id/export?format=pdf\|xlsx` | 📋 | Tagesbestellung als PDF/Excel (Binärdatei, `Content-Disposition: attachment`) |

```jsonc
// POST /day-plans — Request (Uhrzeiten optional; Fallback = globale Einstellungen)
{
  "date": "2026-07-14",
  "restaurantIds": ["uuid1", "uuid2", "uuid3"],
  "organizerId": "uuid" | null,
  "voteDeadlineTime": "10:00",
  "orderDeadlineTime": "11:30",
  "tieBreakStrategy": "RUNOFF"
}
// PATCH /day-plans/:id — alle Felder optional: restaurantIds, organizerId,
//                        voteDeadlineTime, orderDeadlineTime, tieBreakStrategy

// GET /day-plans/:id/summary — Antwort
{
  "dayPlan": { /* DayPlanLite + organizerNote + winnerRestaurant */ },
  "byMenuItem": [                            // aggregiert fürs Telefonat mit dem Restaurant
    { "menuItemId": "uuid", "name": "Pizza Margherita", "price": 8.5,
      "totalQuantity": 4,
      "orders": [ { "user": { /* UserPublic */ }, "quantity": 2, "note": "ohne Zwiebeln" } ] }
  ],
  "byUser": [                                // für die Geld-Einsammlung
    { "user": { /* UserPublic */ },
      "lines": [ { "name": "Pizza Margherita", "quantity": 2, "note": "...", "priceAtOrder": 8.5, "lineTotal": 17.0 } ],
      "userTotal": 17.0 }
  ],
  "participantCount": 9,
  "grandTotal": 87.5
}
```

## 5. Abstimmung Phase 1 (`/day-plans/:id/vote`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `PUT /day-plans/:id/vote` | 👤 | `{ "restaurantId": "uuid" }` — Stimme abgeben/ändern (Upsert). Gilt automatisch für den aktuellen Wahlgang (Haupt- oder Stichwahl). Antwort: aktualisiertes `DayPlanDetail`. |
| `DELETE /day-plans/:id/vote` | 👤 | Eigene Stimme des aktuellen Wahlgangs zurückziehen. Antwort: `DayPlanDetail`. |

Fehler: `409`, wenn die Abstimmung nicht offen ist (`status` ≠ `VOTING_OPEN`/`RUNOFF_VOTING` oder Frist abgelaufen); `400`, wenn das Restaurant an diesem Tag nicht zur Wahl steht (bei Stichwahl: kein Stichwahl-Kandidat).

## 6. Bestellungen Phase 2 (`/day-plans/:id/my-orders`, `/orders`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /day-plans/:id/my-orders` | 👤 | Eigene Positionen des Tages: `OrderLine[]` |
| `PUT /day-plans/:id/my-orders` | 👤 | **Ersetzt** die eigenen Positionen komplett (leeres Array = stornieren). Antwort: `OrderLine[]` |
| `GET /orders/my?page=&limit=` | 👤 | Historie, absteigend nach Datum (s. u.) |

```jsonc
// PUT /day-plans/:id/my-orders — Request
{ "items": [ { "menuItemId": "uuid", "quantity": 2, "note": "ohne Zwiebeln" },
             { "menuItemId": "uuid2", "quantity": 1 } ] }
// Fehler: 409 wenn status ≠ ORDERING_OPEN oder Frist abgelaufen,
//         400 wenn ein Gericht nicht zum Gewinner-Restaurant gehört oder nicht verfügbar ist.

// GET /orders/my — Antwortelemente (paginiert)
{
  "dayPlanId": "uuid", "date": "2026-07-10", "dayStatus": "DELIVERED",
  "restaurantName": "Pizzeria Roma",
  "lines": [ { "name": "Pizza Margherita", "quantity": 1, "note": null, "priceAtOrder": 8.5 } ],
  "total": 8.5
}
```

## 7. Wochenvorlage (`/weekly-templates`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /weekly-templates` | 🛡️ | Alle 7 Wochentage (auch leere) |
| `PUT /weekly-templates/:weekday` | 🛡️ | Vorlage für Wochentag 0–6 (0 = Sonntag) anlegen/ersetzen |
| `DELETE /weekly-templates/:weekday` | 🛡️ | Vorlage entfernen |

```jsonc
// PUT /weekly-templates/1 — Request (Montag)
{
  "isActive": true,
  "restaurantIds": ["uuid1", "uuid2"],
  "organizerId": "uuid" | null,
  "voteDeadlineTime": "10:00",
  "orderDeadlineTime": "11:30",
  "tieBreakStrategy": null            // null = globale Einstellung verwenden
}
// GET-Antwort: [{ "weekday": 1, "isActive": true, "restaurants": [{id,name}],
//                 "organizer": UserPublic|null, "voteDeadlineTime": "10:00",
//                 "orderDeadlineTime": "11:30", "tieBreakStrategy": null }, ...]
```

## 8. Benachrichtigungen (`/notifications`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /notifications?unreadOnly=true&page=&limit=` | 👤 | Eigene Benachrichtigungen + `unreadCount` |
| `PATCH /notifications/:id/read` | 👤 | Als gelesen markieren |
| `POST /notifications/read-all` | 👤 | Alle als gelesen markieren |

Antwort von `GET`: `{ "items": [Notification], "total": 42, "page": 1, "limit": 20, "unreadCount": 3 }`

## 9. Statistiken (`/stats`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /stats/dashboard?days=30` | 🛡️ | Admin-Dashboard-Kennzahlen |
| `GET /stats/me` | 👤 | Persönliche Statistik |

```jsonc
// GET /stats/dashboard — Antwort
{
  "totalUsers": 25, "activeUsers": 23,
  "participationRate": 0.78,            // Ø Teilnehmerquote (Besteller/aktive Benutzer) im Zeitraum
  "votesToday": 18, "ordersToday": 15,
  "topRestaurants": [ { "restaurantId": "uuid", "name": "Pizzeria Roma", "wins": 8, "votes": 74 } ],
  "topMenuItems": [ { "name": "Pizza Margherita", "restaurantName": "Pizzeria Roma", "totalQuantity": 21 } ],
  "ordersPerDay": [ { "date": "2026-07-10", "participants": 15, "orders": 19, "total": 142.5 } ],
  "totalSpend": 1890.0
}
// GET /stats/me — Antwort
{ "daysParticipated": 14, "totalItems": 19, "totalSpend": 161.5,
  "favoriteRestaurant": "Pizzeria Roma", "favoriteMenuItem": "Pizza Margherita" }
```

## 10. Einstellungen (`/settings`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /settings` | 🛡️ | Globale Einstellungen |
| `PATCH /settings` | 🛡️ | Teilweise ändern |

```jsonc
{
  "voteDeadlineTime": "10:00", "orderDeadlineTime": "11:30",
  "tieBreakStrategy": "RUNOFF", "runoffMinutes": 15,
  "reminderLeadMinutes": 30, "timezone": "Europe/Berlin",
  "autoGenerateFromTemplate": true
}
```

## 11. Audit-Log (`/audit-logs`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /audit-logs?page=&limit=&action=&actorId=` | 🛡️ | Protokoll, neueste zuerst |

Antwortelement: `{ "id", "actor": UserPublic | null, "action": "dayplan.decideWinner", "entityType": "DayPlan", "entityId": "uuid", "details": { ... }, "createdAt": "..." }` (`actor = null` → System/Scheduler).

## 12. Web-Push (optional, `/push`)

| Methode & Pfad | Zugriff | Beschreibung |
|---|---|---|
| `GET /push/vapid-public-key` | 👤 | `{ "key": "..." \| null }` — `null`, wenn Push serverseitig nicht konfiguriert |
| `POST /push/subscribe` | 👤 | Browser-Subscription speichern `{ endpoint, keys: { p256dh, auth } }` |
| `DELETE /push/subscribe` | 👤 | `{ "endpoint": "..." }` entfernen |

## 13. Health (`/health`)

`GET /health` 🌐 → `{ "status": "ok", "db": "up", "time": "..." }` (503, wenn DB nicht erreichbar).

---

## Statuscodes (Zusammenfassung)

| Code | Bedeutung |
|---|---|
| 200 / 201 | OK / erstellt |
| 400 | Validierungsfehler (Details in `message[]`) |
| 401 | Nicht angemeldet / Token abgelaufen → Frontend versucht `POST /auth/refresh`, danach Redirect zum Login |
| 403 | Fehlende Rolle/Berechtigung (z. B. kein Organisator dieses Tages) |
| 404 | Nicht gefunden (auch: heute kein Tagesplan) |
| 409 | Fachlicher Konflikt (Frist abgelaufen, falscher Status, doppelter Plan/E-Mail) |
| 503 | Health: Abhängigkeit nicht verfügbar |
