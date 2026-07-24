# Datenbankmodell

Die Anwendung verwendet **SQLite** (Datei `server/data/app.db`, wird beim ersten Start
automatisch angelegt). Das Schema liegt in [`server/src/db.js`](../server/src/db.js).

## ER-Diagramm

```mermaid
erDiagram
    users ||--o{ restaurant_votes : "stimmt ab"
    users ||--o{ orders : "bestellt"
    users |o--o{ days : "organisiert"
    users ||--o{ push_subscriptions : "abonniert Push"
    days ||--o{ notification_log : "löst aus"

    restaurants ||--o{ menu_items : "hat"
    restaurants ||--o{ day_restaurants : "steht zur Wahl"
    restaurants ||--o{ restaurant_votes : "erhält Stimme"
    restaurants |o--o{ days : "gewinnt"

    days ||--o{ day_restaurants : "bietet an"
    days ||--o{ restaurant_votes : "sammelt"
    days ||--o{ orders : "sammelt"

    orders ||--o{ order_items : "enthält"
    menu_items |o--o{ order_items : "wird bestellt"

    users {
        int id PK
        text username UK "eindeutig, case-insensitiv"
        text display_name
        text password_hash "bcrypt"
        text role "user | admin"
        int can_plan "Berechtigung Planung (0/1)"
        int is_active
        text created_at
    }

    restaurants {
        int id PK
        text name
        text description
        text phone
        text website
        int is_active
    }

    menu_items {
        int id PK
        int restaurant_id FK
        text name "eindeutig je Restaurant"
        text description
        int price_cents "Preis in Cent, optional"
        text category
        text allergens
        text weekdays "ISO-Wochentage (CSV), leer = jeden Tag"
        int is_active
    }

    days {
        int id PK
        text date UK "YYYY-MM-DD"
        int organizer_id FK "Organisator des Tages"
        text phase1_deadline "ISO-Zeitstempel (UTC)"
        text phase2_deadline "ISO-Zeitstempel (UTC)"
        text status "phase1 | phase2 | closed"
        int winning_restaurant_id FK
        int auto_created "automatisch erzeugt (0/1)"
    }

    day_restaurants {
        int id PK
        int day_id FK
        int restaurant_id FK
        int position "Reihenfolge, Tie-Break"
    }

    restaurant_votes {
        int id PK
        int day_id FK
        int user_id FK "eine Stimme je Tag (UNIQUE)"
        int restaurant_id FK
    }

    orders {
        int id PK
        int day_id FK
        int user_id FK "eine Bestellung je Tag (UNIQUE)"
        int menu_item_id FK "erste Position (Altbestand/Referenz)"
        text note "Bemerkung"
        text status "eingegangen | bestellt | geliefert | storniert"
        int paid
        text updated_at
    }

    order_items {
        int id PK
        int order_id FK
        int menu_item_id FK "je Bestellung mehrere Gerichte (UNIQUE order_id+item)"
    }

    settings {
        text key PK
        text value
    }

    push_subscriptions {
        int id PK
        int user_id FK
        text endpoint UK "Web-Push-Endpunkt (Gerät/Browser)"
        text p256dh
        text auth
    }

    notification_log {
        int id PK
        int day_id FK
        text kind "organizer_assigned | phase_closed"
        int user_id FK "Empfänger; UNIQUE(day_id,kind,user_id)"
    }
```

## Tabellen im Überblick

| Tabelle | Zweck |
| --- | --- |
| `users` | Benutzerkonten mit Rolle (`user`/`admin`) und dem additiven Flag `can_plan` (Berechtigung **„Planung"**: Tage anlegen/ändern/absagen und Planungs-Standardzeiten, aber keine Benutzer-/Restaurant-/Design-/SSO-Verwaltung). Nach außen erscheinen so drei Rollen: `user`, `planung`, `admin`. Die Organisator-Rolle ist keine globale Rolle, sondern eine **Zuweisung pro Tag** (`days.organizer_id`). |
| `restaurants` | Stammdaten der Restaurants/Lieferdienste. Statt harter Löschung werden verwendete Restaurants deaktiviert (`is_active = 0`), damit die Historie erhalten bleibt. |
| `menu_items` | Speisekarte je Restaurant, Preis in Cent (vermeidet Rundungsfehler). `weekdays` (CSV der ISO-Wochentage, leer = jeden Tag) bindet „Tagesessen" an bestimmte Wochentage – nur dann sichtbar/bestellbar; die Prüfung erfolgt serverseitig. |
| `days` | Tagesplanung: Datum, Organisator, beide Deadlines, abgeleiteter Status und eingefrorener Gewinner. `auto_created = 1` kennzeichnet Tage aus der automatischen Planung; sie bleiben normal (manuell) bearbeitbar. |
| `day_restaurants` | Welche Restaurants an einem Tag zur Wahl stehen (`position` = Anzeige-Reihenfolge und Tie-Break bei Stimmengleichheit). |
| `restaurant_votes` | Phase-1-Stimmen. `UNIQUE (day_id, user_id)` erzwingt eine Stimme pro Person und Tag; erneutes Abstimmen ändert die Stimme (Upsert). |
| `orders` | Phase-2-Bestellungen (Kopf je Person und Tag). `UNIQUE (day_id, user_id)` erzwingt eine Bestellung pro Person und Tag; änderbar bis Bestellschluss. Status/Bezahlt werden vom Organisator gepflegt. `menu_item_id` hält aus Kompatibilitätsgründen die erste Position; maßgeblich sind die `order_items`. |
| `order_items` | Einzelne Gerichte einer Bestellung – erlaubt die **Mehrfachauswahl** (z. B. Vorspeise + Hauptgang + Beilage). Preis/Name werden live aus `menu_items` gelesen; die Bestellsumme ist die Summe der Positionen. |
| `settings` | Key-Value-Einstellungen: Standard-Abstimmungszeiten/-Organisator-Modus für neue Tage, die Konfiguration der automatischen Tagesplanung (`auto_plan_config`, JSON) sowie die VAPID-Schlüssel für Web Push. |
| `push_subscriptions` | Web-Push-Abonnements je Nutzer (mehrere Geräte/Browser möglich). Tote Endpunkte (404/410) werden beim Senden automatisch entfernt. |
| `notification_log` | Protokoll verschickter Benachrichtigungen. `UNIQUE (day_id, kind, user_id)` erzwingt „genau einmal" je Auslöser (Organisator bestimmt / Bestellphase beendet). |

## Statuslogik (Phasenübergänge)

Der Tageszustand wird **aus den Deadlines abgeleitet** (nicht manuell geschaltet), siehe
[`server/src/dayLogic.js`](../server/src/dayLogic.js):

```
jetzt < phase1_deadline                     -> status = phase1   (Restaurantwahl)
phase1_deadline <= jetzt < phase2_deadline  -> status = phase2   (Essensauswahl)
jetzt >= phase2_deadline                    -> status = closed   (abgeschlossen)
```

* Beim Übergang zu Phase 2 wird der **Gewinner ermittelt und eingefroren**
  (`winning_restaurant_id`): meiste Stimmen, bei Gleichstand gewinnt die zuerst
  gelistete Option; ohne Stimmen die erste Option, damit Phase 2 immer stattfinden kann.
* Die Ableitung passiert bei jedem lesenden Zugriff **und** über einen Hintergrund-Job
  (alle 30 Sekunden), damit Übergänge auch ohne Traffic erfolgen.
* Ändert ein Admin die Deadlines nachträglich, wird der Status neu berechnet –
  eine Verlängerung von Phase 1 öffnet die Abstimmung also wieder.

## Migrationen

Schema-Änderungen laufen über ein additives Migrationssystem in
[`server/src/db.js`](../server/src/db.js): Der Stand wird in `PRAGMA
user_version` verfolgt, Migrationen ergänzen ausschließlich neue Spalten mit
sinnvollen Standardwerten (nicht-destruktiv) und laufen automatisch beim
Serverstart sowie explizit im Update-Skript. Bisherige Migrationen:

| Version | Inhalt |
| --- | --- |
| 1 | `restaurants.has_menu` (Restaurants ohne Speisekarte; Bestandsdaten: „ja“, wenn Gerichte hinterlegt sind) |
| 2 | `menu_items.category` und `menu_items.allergens` (Kategorien & Allergene, CSV-/URL-Import) |
| 3 | `days.organizer_mode` und `days.organizer_source` (Organisator-Modi: manuell/freiwillig/zufällig) |
| 4 | `orders.paid` (Bezahlt-Status) |
| 5 | `users.token_version` (serverseitige Token-Invalidierung bei Logout/Passwortänderung) |
| 6 | `users.can_plan` (Berechtigung „Planung": Tagesplanung ohne weitere Admin-Rechte) |
| 7 | `days.auto_created` (Kennzeichnung automatisch erzeugter Tage) |
| 8 | `menu_items.weekdays` (Tagesessen: Bindung an Wochentage) |
| 9 | `order_items` (Mehrfachauswahl je Bestellung; Altbestand aus `orders.menu_item_id` übernommen) |
| 10 | `push_subscriptions` und `notification_log` (Web-Push-Benachrichtigungen für Organisatoren) |

## Zeitzonen

Alle Zeitstempel werden als **ISO-Strings in UTC** gespeichert. Das Frontend rechnet zur
Anzeige in die lokale Zeitzone des Browsers um. Serverseitig (z. B. „Welcher Tag ist
heute?“, Seed-Daten) gilt die Zeitzone `APP_TIMEZONE` (Standard: `Europe/Berlin`).
