# Frontend-Konzept — NIGEFA Essensbestellung

## Technologie-Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Framework | **Next.js (App Router) + React + TypeScript** | moderne Routing-/Layout-Struktur, schnelles Tooling |
| Styling | **Tailwind CSS v3** (Dark Mode über `class`-Strategie) | konsistentes Design-System, kleine Bundles |
| Server-State | **TanStack Query v5** | Caching, Polling (Live-Ergebnisse), Mutations mit Invalidierung |
| Auth-State | React Context + `localStorage` | Access/Refresh-Token clientseitig; automatischer Refresh im API-Client |
| i18n | leichtgewichtiger eigener Provider (`de`/`en`, JSON-Wörterbücher) | keine Framework-Kopplung, Sprache pro Benutzerprofil, sofortiger Wechsel |
| Theme | `next-themes` (System/Hell/Dunkel) | flackerfreier Dark Mode |
| Icons | Inline-SVG-Komponenten | keine zusätzliche Abhängigkeit |

Die App ist bewusst **client-zentriert** (alle datengetriebenen Seiten sind Client-Komponenten): sämtliche Daten sind benutzer- bzw. tokengebunden, SEO ist irrelevant (internes Tool). Next.js liefert Routing, Code-Splitting und das Produktions-Build (`output: 'standalone'` für Docker).

## Routing / Seitenstruktur

```
src/app/
├── layout.tsx                  # Root: ThemeProvider, I18nProvider, QueryClient, AuthProvider
├── login/page.tsx              # 🌐 Anmeldung
├── register/page.tsx           # 🌐 Registrierung (erster Benutzer → Admin-Hinweis)
└── (app)/                      # geschützter Bereich mit AppShell (Navigation)
    ├── layout.tsx              # AuthGuard + Navigation + Benachrichtigungs-Glocke
    ├── page.tsx                # „Heute" — Herzstück (s. u.)
    ├── history/page.tsx        # eigene Bestellhistorie
    ├── notifications/page.tsx  # Benachrichtigungsliste
    ├── settings/page.tsx       # Profil, Sprache, Passwort, Benachrichtigungen
    ├── organizer/page.tsx      # 📋 Organisator-Ansicht (heute + Datumwahl)
    └── admin/                  # 🛡️ nur Admin (Guard im Layout)
        ├── layout.tsx          # Admin-Unternavigation
        ├── page.tsx            # Dashboard (KPIs, Diagramme)
        ├── users/page.tsx      # Benutzerverwaltung
        ├── restaurants/page.tsx            # Restaurantliste
        ├── restaurants/[id]/page.tsx       # Restaurant + Speisekarte + Import
        ├── day-plans/page.tsx              # Tagesplan-Liste + Anlegen
        ├── day-plans/[id]/page.tsx         # Plan-Detail: Optionen, Stimmen, Aktionen
        ├── weekly-template/page.tsx        # Wochenvorlage (Mo–So)
        ├── settings/page.tsx               # globale Einstellungen
        └── audit/page.tsx                  # Audit-Log
```

## Die „Heute"-Seite (zentrale Ansicht)

Rendert je nach `DayPlanDetail.status` unterschiedliche Panels — eine kleine Zustandsmaschine im UI:

| Status | Anzeige |
|---|---|
| kein Plan (404) | Empty-State „Heute findet keine Bestellung statt" |
| `SCHEDULED` | Vorschau der Optionen + „Abstimmung startet in Kürze" |
| `VOTING_OPEN` | **VotePanel**: Restaurant-Karten mit Live-Stimmbalken, eigener Stimme (markiert), Countdown bis Frist 1 |
| `RUNOFF_VOTING` | VotePanel nur mit Stichwahl-Kandidaten + Hinweisbanner „Stichwahl!" |
| `TIE_ADMIN_DECISION` | Banner „Gleichstand — ein Admin entscheidet"; Admins sehen Entscheiden-Buttons direkt |
| `ORDERING_OPEN` | **OrderPanel**: Gewinner-Banner, Speisekarte nach Kategorie, Warenkorb (Menge ±, Bemerkung), Countdown bis Frist 2, Summe |
| `ORDERING_CLOSED` | eigene Bestellung read-only + „Organisator bestellt…" |
| `ORDERED` / `DELIVERED` | Statusbanner (+ Organisator-Kommentar), eigene Bestellung read-only |
| `CANCELLED` | Hinweisbanner |

**Live-Verhalten:** `useQuery(['day-plans','today'], …, { refetchInterval: 15_000 })` — Stimmenzahlen und Phasenwechsel erscheinen ohne Reload. Der Countdown (`<Countdown deadline=…/>`) tickt sekündlich und triggert bei 0 einen Refetch.

## API-Client & Auth-Flow

`src/lib/api.ts` — dünner `fetch`-Wrapper:

1. hängt `Authorization: Bearer <accessToken>` an,
2. bei `401`: einmaliger `POST /auth/refresh` (Single-Flight: parallele 401s warten auf denselben Refresh), Original-Request wird wiederholt,
3. schlägt der Refresh fehl → Token löschen, Redirect `/login`.

`AuthProvider` hält `user` (aus `GET /auth/me`), bietet `login/register/logout` und persistiert Tokens in `localStorage` (`nigefa.accessToken` / `nigefa.refreshToken`). Routen-Schutz übernimmt das `(app)/layout` (Redirect zu `/login`), Admin-Schutz das `admin/layout` (Redirect zu `/`).

## Datenhaltung mit TanStack Query

| Query-Key | Endpoint | Besonderheit |
|---|---|---|
| `['day-plans','today']` | `GET /day-plans/today` | `refetchInterval: 15s`, `retry: false` bei 404 |
| `['day-plans', id]` | `GET /day-plans/:id` | Admin-/Organisator-Detail |
| `['day-plans','range',from,to]` | `GET /day-plans` | Listen |
| `['orders','my',page]` | `GET /orders/my` | Historie |
| `['notifications',…]` | `GET /notifications` | `refetchInterval: 30s` → Badge an der Glocke |
| `['restaurants']`, `['users']`, `['settings']`, `['stats']`, `['audit']`, `['weekly-templates']` | … | Standard |

Mutations (`PUT /vote`, `PUT /my-orders`, Admin-Aktionen) invalidieren die betroffenen Keys; `PUT /vote` nutzt die zurückgegebene `DayPlanDetail` direkt als neuen Cache-Wert (kein Zwischen-Flackern).

## Mehrsprachigkeit (de/en)

- `src/lib/i18n/de.json` + `en.json`, flache Schlüssel mit Punkt-Namespace (`today.vote.title`).
- `I18nProvider` mit `t(key, params?)`; Platzhalter `{name}`-Syntax.
- Sprachwahl: Buttons im Header/Einstellungen → `PATCH /users/me { locale }` + sofortiger Kontextwechsel; für nicht angemeldete Seiten Fallback `localStorage`, initial `de`.
- Datums-/Währungsformatierung über `Intl.DateTimeFormat`/`NumberFormat` mit aktiver Locale (EUR).

## Komponentenarchitektur

```
src/components/
├── ui/            # Design-System: Button, Card, Input, Select, Badge, Dialog,
│                  # Table, Tabs, Spinner, EmptyState, Toast …
├── layout/        # AppShell, Sidebar/Topbar, MobileNav, NotificationBell,
│                  # ThemeToggle, LanguageSwitcher, UserMenu
├── today/         # VotePanel, VoteOptionCard, OrderPanel, MenuItemRow,
│                  # CartSummary, PhaseBanner, Countdown
├── organizer/     # SummaryByItem, SummaryByUser, StatusActions, ExportButtons
└── admin/         # StatCard, Charts (leichtgewichtige SVG-Balken/Linien),
                   # UserTable, RestaurantForm, MenuEditor, DayPlanForm,
                   # WeeklyTemplateEditor, AuditTable
```

Formulare: kontrollierte Komponenten + API-Fehleranzeige (422/400-Feldmeldungen), Erfolgs-/Fehler-Toasts.

## Fehler- & Ladezustände

- Skeleton-Loader für Karten/Tabellen, `EmptyState`-Komponente mit Illustration/Icon.
- Globaler Toast-Mechanismus (Context) für Mutationen.
- 404 heute-Plan ist **kein Fehler**, sondern gerenderter Empty-State.

## Responsive & Dark Mode

Siehe [06-ui-ux-konzept.md](06-ui-ux-konzept.md) — Breakpoints `sm/md/lg`, Mobile-Bottom-Navigation, Desktop-Sidebar; Dark Mode via Tailwind-`dark:`-Klassen, Umschalter Hell/Dunkel/System.

## Web-Push (optional)

Einstellungen zeigen den Push-Schalter nur, wenn (a) Browser `PushManager` unterstützt und (b) `GET /push/vapid-public-key` einen Schlüssel liefert. Aktivierung: Permission → `serviceWorker.register('/sw.js')` → `pushManager.subscribe` → `POST /push/subscribe`. `public/sw.js` zeigt eingehende Push-Nachrichten als Notification an.
