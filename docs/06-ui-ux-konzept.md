# UI/UX-Konzept — NIGEFA Essensbestellung

## Leitidee

**„In 10 Sekunden abgestimmt, in 30 Sekunden bestellt."** Die App wird täglich zwischen Tür und Angel benutzt — meist mobil, oft unter Zeitdruck kurz vor der Frist. Daraus folgt:

1. Die **Heute-Ansicht ist die Startseite** — kein Dashboard-Umweg für normale Benutzer.
2. **Eine primäre Aktion pro Phase**: erst „Abstimmen", dann „Bestellen". Alles andere tritt zurück.
3. **Frist immer sichtbar**: prominenter Countdown, ab 10 Minuten Restzeit in Warnfarbe.
4. **Live-Feedback**: Stimmbalken aktualisieren sich automatisch; die eigene Stimme ist deutlich markiert.

## Design-System

### Farben (Tailwind-Palette)

| Rolle | Hell | Dunkel | Verwendung |
|---|---|---|---|
| Primär | `emerald-600` | `emerald-500` | Aktionen, aktive Zustände, Eigene-Stimme-Markierung |
| Hintergrund | `gray-50` | `gray-950` | App-Hintergrund |
| Fläche | `white` | `gray-900` | Karten, Panels |
| Rahmen | `gray-200` | `gray-800` | Trennlinien |
| Text | `gray-900` / `gray-500` | `gray-100` / `gray-400` | primär / sekundär |
| Erfolg / Warnung / Fehler | `green-600` / `amber-500` / `red-600` | je `-400/-500` | Status, Countdown-Warnung, destruktive Aktionen |

Statusfarben der Tagesphasen (Badges): `SCHEDULED` grau · `VOTING_OPEN` blau · `RUNOFF_VOTING` violett · `TIE_ADMIN_DECISION` amber · `ORDERING_OPEN` emerald · `ORDERING_CLOSED` amber · `ORDERED` sky · `DELIVERED` green · `CANCELLED` rot.

### Typografie & Grundmaße

- Systemschrift-Stack (`font-sans`), Basis 16 px; Überschriften `text-xl/2xl` semibold.
- Abstände auf 4-px-Raster; Karten `rounded-xl`, Buttons/Inputs `rounded-lg`, Fokus-Ringe sichtbar (`focus-visible:ring-2`).
- Touch-Ziele ≥ 44 px Höhe (mobile Nutzung!).

### Dark Mode

`class`-Strategie mit drei Optionen **System / Hell / Dunkel** (Umschalter im Header und in den Einstellungen, Persistenz via `next-themes`). Alle Komponenten definieren beide Varianten; Diagramme nutzen kontrastsichere Töne in beiden Modi.

## Layout & Navigation

```
Desktop (≥1024px)                        Mobil (<1024px)
┌────────┬───────────────────────┐      ┌───────────────────────┐
│ Logo   │ Topbar: 🔔 🌓 DE/EN 👤 │      │ Topbar: Logo 🔔 👤     │
│        ├───────────────────────┤      ├───────────────────────┤
│ Heute  │                       │      │                       │
│ Histo- │      Seiteninhalt     │      │     Seiteninhalt      │
│ rie    │      (max-w-5xl)      │      │                       │
│ Orga   │                       │      ├───────────────────────┤
│ Admin▾ │                       │      │ ⬤Heute 🕘Historie ⚙️… │ ← Bottom-Nav
└────────┴───────────────────────┘      └───────────────────────┘
```

- **Desktop:** feste Sidebar (Heute, Historie, Benachrichtigungen, Organisator*, Admin*), Topbar mit Glocke (Ungelesen-Badge), Theme-Toggle, Sprachumschalter, Benutzermenü. *Organisator/Admin-Einträge nur bei Berechtigung.
- **Mobil:** Bottom-Navigation mit 4–5 Einträgen, Topbar reduziert. Admin-Unterseiten als horizontale Tab-Leiste (scrollbar).
- Breakpoints: `sm 640` (Formulare zweispaltig) · `md 768` (Tabellen statt Karten) · `lg 1024` (Sidebar).

## Kern-Flows

### 1) Abstimmen (Phase 1) — Benutzerin Maria, 9:52 Uhr, Smartphone

1. Öffnet die App → Heute-Seite: Banner „Restaurant-Abstimmung läuft", Countdown **„endet in 8 min"** (amber).
2. Drei Restaurant-Karten mit Name, Küche, Live-Stimmbalken (`▮▮▮▮▯ 7 Stimmen`). Ein Tap auf „Pizzeria Roma" → Karte bekommt Rahmen + Häkchen „Deine Stimme", Balken zählt hoch. Umentscheiden = Tap auf andere Karte.
3. Fertig — kein Bestätigungsdialog, dafür Toast „Stimme gespeichert".

### 2) Bestellen (Phase 2) — 10:01 Uhr, Push/Mail „Pizzeria Roma hat gewonnen!"

1. Heute-Seite zeigt Gewinner-Banner 🏆 + Countdown bis 11:30.
2. Speisekarte gruppiert nach Kategorie; jede Zeile: Name, Beschreibung, Preis, **[+]**. 
3. Warenkorb (Desktop: rechte Spalte sticky, mobil: einklappbares Bottom-Sheet): Menge ±, Bemerkungsfeld je Position („ohne Zwiebeln"), Summe. Button **„Bestellung speichern"**.
4. Änderungen bis zur Frist jederzeit; danach read-only mit Hinweis.

### 3) Organisator — 11:31 Uhr, Mail „Bestellung kann aufgegeben werden"

1. Organisator-Ansicht: Zusammenfassung **nach Gericht** (fürs Telefonat: „4× Margherita — 1× ohne Zwiebeln") und **nach Person** (fürs Kassieren, mit Summen).
2. Aktionen: **PDF/Excel exportieren**, Status **„Bestellt"** → später **„Geliefert"**, Kommentarfeld („Lieferung ca. 12:30" — erscheint bei allen Bestellern).

### 4) Admin — Tagesplanung & Gleichstand

- **Wochenvorlage**: Matrix Mo–So → Restaurants (Mehrfachauswahl), Organisator, Fristen. Einzeltage lassen sich in der Tagesplan-Liste abweichend anlegen/bearbeiten.
- **Gleichstand** (Strategie „Admin entscheidet"): Admin sieht auf der Heute-Seite und im Plan-Detail ein amberfarbenes Panel mit den gleichauf liegenden Restaurants und je einem Button „Zum Gewinner machen".
- Manuelles Öffnen/Schließen der Phasen über Aktions-Buttons im Plan-Detail (mit Bestätigungsdialog).

## UI-Zustände & Feedback

| Situation | Muster |
|---|---|
| Laden | Skeleton-Karten (keine Spinner-Vollbildblocker) |
| Kein Plan heute | Empty-State mit Illustration + (Admin: Button „Plan erstellen") |
| Mutation ok / Fehler | Toast unten (mobil) bzw. oben rechts (Desktop), Fehler mit konkreter Ursache („Frist abgelaufen") |
| Destruktiv (Nutzer löschen, Tag absagen) | Bestätigungsdialog mit rotem Primärbutton |
| Frist < 10 min | Countdown pulsiert amber; < 1 min rot |
| Formularfehler | Feldnahe Meldungen aus der API-Antwort |

## Barrierefreiheit

- Vollständige Tastaturbedienung; sichtbare Fokusindikatoren; Abstimmungskarten sind echte `<button>`.
- Kontraste nach WCAG AA in beiden Themes; Statusfarben stets mit Text/Icon kombiniert (nicht nur Farbe).
- `aria-live="polite"` für Countdown-Phasenwechsel und Toasts; Glocken-Badge mit `aria-label` („3 ungelesene Benachrichtigungen").
- Sprachumschalter setzt `<html lang>`.

## Mehrsprachigkeit

Deutsch ist Standardsprache, Englisch vollständig gepflegt. Alle Texte über `t()`-Schlüssel; Datum/Uhrzeit/Währung lokalisiert (`Intl`, EUR). E-Mails folgen der Profilsprache des Empfängers.
