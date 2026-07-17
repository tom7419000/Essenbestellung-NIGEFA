# API-Endpunkte

Basis-URL: `/api`. Authentifizierung per **JWT** im Header `Authorization: Bearer <token>`
(Gültigkeit 12 h). Alle Antworten sind JSON; Fehler haben die Form
`{ "message": "…" }` mit passendem HTTP-Status (400/401/403/404/409).

Rollen-Legende: 🔓 öffentlich · 👤 angemeldet · 📋 Organisator des Tages oder Admin · 🔑 Admin

## Authentifizierung

| Methode | Pfad | Rolle | Beschreibung |
| --- | --- | :-: | --- |
| POST | `/auth/login` | 🔓 | Anmeldung. Body: `{username, password}` → `{token, user}` |
| GET | `/auth/me` | 👤 | Eigenes Profil zum Sitzungs-Check |
| POST | `/auth/change-password` | 👤 | Body: `{oldPassword, newPassword}` |

## Tagesablauf (Abstimmung & Bestellung)

| Methode | Pfad | Rolle | Beschreibung |
| --- | --- | :-: | --- |
| GET | `/days/today` | 👤 | Kompletter Zustand des heutigen Tages: Phase, Deadlines, Restaurants mit Stimmen, eigene Stimme; ab Phase 2 zusätzlich Gewinner, Speisekarte, eigene Bestellung. Enthält `serverNow` für den Countdown-Abgleich. |
| POST | `/days/:id/vote` | 👤 | Abstimmen (nur Phase 1). Body: `{restaurantId}`. Erneuter Aufruf ändert die Stimme. |
| DELETE | `/days/:id/vote` | 👤 | Eigene Stimme zurückziehen (nur Phase 1) |
| POST | `/days/:id/order` | 👤 | Bestellen (nur Phase 2). Body: `{menuItemId, note}`. Erneuter Aufruf ändert die Bestellung; das Gericht muss zum Gewinner-Restaurant gehören. |
| DELETE | `/days/:id/order` | 👤 | Eigene Bestellung löschen (nur Phase 2) |

## Organisator

| Methode | Pfad | Rolle | Beschreibung |
| --- | --- | :-: | --- |
| GET | `/days/:id/full` | 📋 | Vollständige Tagesansicht: Abstimmungsergebnis, alle Bestellungen, Sammelbestellung (gruppiert, mit Summen) |
| PATCH | `/orders/:id/status` | 📋 | Status einer Bestellung setzen. Body: `{status}` (`eingegangen` \| `bestellt` \| `geliefert` \| `storniert`) |
| PATCH | `/days/:id/orders-status` | 📋 | Sammelaktion: Status aller (nicht stornierten) Bestellungen des Tages setzen |
| GET | `/my/organizer-days` | 👤 | Tage, für die man selbst Organisator ist |

## Eigene Daten

| Methode | Pfad | Rolle | Beschreibung |
| --- | --- | :-: | --- |
| GET | `/my/orders` | 👤 | Eigene Bestellhistorie (Datum, Restaurant, Gericht, Preis, Status) |

## Administration

| Methode | Pfad | Rolle | Beschreibung |
| --- | --- | :-: | --- |
| GET | `/days` | 🔑 | Alle geplanten Tage inkl. Organisator, Gewinner, Stimmen-/Bestellzahlen |
| POST | `/days` | 🔑 | Tag anlegen. Body: `{date, organizerId, phase1Deadline, phase2Deadline, restaurantIds[]}` (Deadlines als ISO-Zeitstempel) |
| PUT | `/days/:id` | 🔑 | Tag ändern (gleicher Body). Status/Gewinner werden aus den neuen Deadlines neu berechnet. |
| DELETE | `/days/:id` | 🔑 | Tag inkl. Stimmen und Bestellungen löschen |
| GET | `/users` | 🔑 | Benutzerliste |
| POST | `/users` | 🔑 | Benutzer anlegen. Body: `{username, displayName, password, role}` |
| PUT | `/users/:id` | 🔑 | Benutzer ändern (`displayName`, `role`, `isActive`, optional `password`) |
| DELETE | `/users/:id` | 🔑 | Benutzer löschen (eigenes Konto ausgenommen) |
| GET | `/restaurants` | 👤 | Aktive Restaurants (`?all=1` als Admin: inkl. deaktivierter) |
| POST | `/restaurants` | 🔑 | Restaurant anlegen |
| PUT | `/restaurants/:id` | 🔑 | Restaurant ändern (inkl. `isActive`) |
| DELETE | `/restaurants/:id` | 🔑 | Restaurant löschen; wird es bereits verwendet, stattdessen deaktivieren |
| GET | `/restaurants/:id/menu` | 👤 | Speisekarte (`?all=1` als Admin: inkl. deaktivierter Gerichte) |
| POST | `/restaurants/:id/menu` | 🔑 | Gericht anlegen. Body: `{name, category, description, allergens, priceCents}` |
| POST | `/restaurants/:id/menu/import-csv` | 🔑 | CSV-Import. Body: `{csv, mode: "append"\|"replace"}` → Statistik + Fehlzeilen |
| POST | `/restaurants/:id/menu/import-items` | 🔑 | Geprüfte Gerichte aus der Import-Vorschau übernehmen. Body: `{mode, items[]}` |
| POST | `/menu-import/preview` | 🔑 | Speisekarte einer externen Seite auslesen (Lieferando oder Gastromia, siehe [speisekarten-import.md](speisekarten-import.md)). Body: `{url}` → `{provider, restaurantName, items[], warnings[]}` (noch ohne Speichern) |
| PUT | `/menu-items/:id` | 🔑 | Gericht ändern (inkl. `isActive`) |
| DELETE | `/menu-items/:id` | 🔑 | Gericht löschen; bereits bestellte Gerichte werden deaktiviert |
| GET | `/settings` | 🔑 | Standard-Abstimmungszeiten und Organisator-Modus |
| PUT | `/settings` | 🔑 | Body: `{defaultPhase1Time, defaultPhase2Time, defaultOrganizerMode, organizerAssignMinutes}` |
| GET | `/sso/settings` | 🔑 | SSO-Konfiguration (Client-/Tenant-ID, Verbundanmeldung) |
| PUT | `/sso/settings` | 🔑 | SSO speichern. Body: `{enabled, autoRedirect, clientId, tenantId, ficIssuer, ficSubject, ficAudience}` |
| POST | `/sso/test` | 🔑 | Verbindungstest: holt per Verbundanmeldeinformation ein Token von Entra ID → `{ok, message}` |

## SSO (Microsoft Entra ID)

Details siehe [sso-entra-id.md](sso-entra-id.md).

| Methode | Pfad | Rolle | Beschreibung |
| --- | --- | :-: | --- |
| POST | `/auth/sso` | 🔓 | ID-Token aus dem MSAL-Login gegen App-JWT eintauschen. Body: `{idToken}` |
| GET | `/sso/config` | 🔓 | Laufzeit-Konfiguration für den Login-Button (`{enabled, clientId, tenantId, autoRedirect}`) |
| GET | `/sso/jwks` | 🔓 | Öffentliche Schlüssel des Portals – Entra ID prüft darüber die Client-Assertion der Verbundanmeldung |
| GET | `/.well-known/openid-configuration` | 🔓 | OIDC-Discovery des Portals (Issuer/JWKS) für die Verbundanmeldeinformation |

## Beispiele

```bash
# Anmelden
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"anna","password":"passwort123"}'

# Heutigen Tag abrufen
curl http://localhost:3001/api/days/today -H "Authorization: Bearer $TOKEN"

# Abstimmen (Phase 1)
curl -X POST http://localhost:3001/api/days/2/vote \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"restaurantId":1}'

# Bestellen (Phase 2)
curl -X POST http://localhost:3001/api/days/2/order \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"menuItemId":3,"note":"ohne Zwiebeln"}'

# Organisator: alle Bestellungen auf „bestellt“ setzen
curl -X PATCH http://localhost:3001/api/days/2/orders-status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"bestellt"}'
```

Beispielantwort `GET /days/today` (Phase 2):

```json
{
  "day": {
    "id": 2,
    "date": "2026-07-14",
    "status": "phase2",
    "organizerId": 2,
    "phase1Deadline": "2026-07-14T08:30:00.000Z",
    "phase2Deadline": "2026-07-14T09:45:00.000Z",
    "winningRestaurantId": 1
  },
  "serverNow": "2026-07-14T08:31:12.000Z",
  "organizerName": "Anna Schmidt",
  "isOrganizer": false,
  "restaurants": [{ "id": 1, "name": "Pizzeria Bella Italia", "votes": 3 }],
  "myVote": 1,
  "winner": { "id": 1, "name": "Pizzeria Bella Italia", "phone": "030 1234567" },
  "winnerVotes": 3,
  "menu": [{ "id": 1, "name": "Pizza Margherita", "priceCents": 850 }],
  "myOrder": null,
  "orderCount": 2
}
```
