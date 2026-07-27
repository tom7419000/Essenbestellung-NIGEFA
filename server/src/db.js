import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Datenverzeichnis (SQLite-Datei, JWT-Secret, Branding-Uploads). Standardmäßig
// server/data; per DATA_DIR frei wählbar. Auf Plesk empfiehlt sich ein Pfad
// AUSSERHALB des Document Root (z. B. .../essenportal-data), damit die
// Datenbank nicht über die Domain erreichbar ist und im Backup landet.
export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  can_plan      INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS restaurants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  website     TEXT NOT NULL DEFAULT '',
  has_menu    INTEGER NOT NULL DEFAULT 1,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price_cents   INTEGER,
  category      TEXT NOT NULL DEFAULT '',
  allergens     TEXT NOT NULL DEFAULT '',
  weekdays      TEXT NOT NULL DEFAULT '',
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (restaurant_id, name)
);

-- Ein "Tag" ist die Planung für ein Datum: Restaurant-Optionen, Organisator, Deadlines.
-- status wird aus den Deadlines abgeleitet: phase1 -> phase2 -> closed.
CREATE TABLE IF NOT EXISTS days (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  date                  TEXT NOT NULL UNIQUE,
  organizer_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  organizer_mode        TEXT NOT NULL DEFAULT 'manuell',
  organizer_source      TEXT,
  phase1_deadline       TEXT NOT NULL,
  phase2_deadline       TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'phase1' CHECK (status IN ('phase1', 'phase2', 'closed')),
  winning_restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  auto_created          INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS day_restaurants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id        INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS restaurant_votes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id        INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day_id, user_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id       INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  note         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'eingegangen' CHECK (status IN ('eingegangen', 'bestellt', 'geliefert', 'storniert')),
  paid         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day_id, user_id)
);

-- Einzelpositionen einer Bestellung (Mehrfachauswahl: Vorspeise + Hauptgang + …).
-- Eine Bestellung (orders) je Person und Tag bündelt mehrere Gerichte.
CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  UNIQUE (order_id, menu_item_id)
);

-- Web-Push-Abonnements je Nutzer (mehrere Geräte/Browser möglich).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Verschickte Benachrichtigungen – erzwingt „genau einmal" je (Tag, Art, Nutzer).
CREATE TABLE IF NOT EXISTS notification_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id     INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day_id, kind, user_id)
);

-- Vom Planer gelöschte (Werktags-)Daten, die die Automatik NICHT erneut anlegen
-- soll. Wird beim manuellen Neuanlegen desselben Datums wieder entfernt.
CREATE TABLE IF NOT EXISTS auto_plan_removed (
  date TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_votes_day ON restaurant_votes(day_id);
CREATE INDEX IF NOT EXISTS idx_orders_day ON orders(day_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
`;

function columnExists(table, column) {
  return db.pragma(`table_info(${table})`).some((c) => c.name === column);
}

// Additive, nicht-destruktive Migrationen für bestehende Installationen.
// Der Stand wird in PRAGMA user_version verfolgt; neue Datenbanken erhalten
// das aktuelle Schema direkt über die CREATE-TABLE-Anweisungen oben.
const migrations = [
  {
    version: 1,
    name: 'restaurants.has_menu (Restaurants ohne Speisekarte)',
    up() {
      if (!columnExists('restaurants', 'has_menu')) {
        db.exec("ALTER TABLE restaurants ADD COLUMN has_menu INTEGER NOT NULL DEFAULT 1");
        // Bestandsdaten: "ja" nur, wenn bereits Gerichte hinterlegt sind.
        db.exec(`UPDATE restaurants SET has_menu = CASE
          WHEN EXISTS (SELECT 1 FROM menu_items mi WHERE mi.restaurant_id = restaurants.id)
          THEN 1 ELSE 0 END`);
      }
    },
  },
  {
    version: 2,
    name: 'menu_items.category/allergens (Kategorien & Allergene, CSV-Import)',
    up() {
      if (!columnExists('menu_items', 'category')) {
        db.exec("ALTER TABLE menu_items ADD COLUMN category TEXT NOT NULL DEFAULT ''");
      }
      if (!columnExists('menu_items', 'allergens')) {
        db.exec("ALTER TABLE menu_items ADD COLUMN allergens TEXT NOT NULL DEFAULT ''");
      }
    },
  },
  {
    version: 3,
    name: 'days.organizer_mode/organizer_source (Organisator-Modi)',
    up() {
      if (!columnExists('days', 'organizer_mode')) {
        db.exec("ALTER TABLE days ADD COLUMN organizer_mode TEXT NOT NULL DEFAULT 'manuell'");
      }
      if (!columnExists('days', 'organizer_source')) {
        db.exec('ALTER TABLE days ADD COLUMN organizer_source TEXT');
        // Bestehende Zuweisungen stammen aus der manuellen Tagesplanung.
        db.exec("UPDATE days SET organizer_source = 'manuell' WHERE organizer_id IS NOT NULL");
      }
    },
  },
  {
    version: 4,
    name: 'orders.paid (Bezahlt-Status)',
    up() {
      if (!columnExists('orders', 'paid')) {
        db.exec('ALTER TABLE orders ADD COLUMN paid INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
  {
    version: 5,
    name: 'users.token_version (Token-Invalidierung bei Logout/Passwortänderung)',
    up() {
      if (!columnExists('users', 'token_version')) {
        db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
  {
    version: 6,
    name: 'users.can_plan (Berechtigung „Planung")',
    up() {
      if (!columnExists('users', 'can_plan')) {
        db.exec('ALTER TABLE users ADD COLUMN can_plan INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
  {
    version: 7,
    name: 'days.auto_created (automatisch erstellte Tage kennzeichnen)',
    up() {
      if (!columnExists('days', 'auto_created')) {
        db.exec('ALTER TABLE days ADD COLUMN auto_created INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
  {
    version: 8,
    name: 'menu_items.weekdays (Tagesessen: Bindung an Wochentage)',
    up() {
      if (!columnExists('menu_items', 'weekdays')) {
        db.exec("ALTER TABLE menu_items ADD COLUMN weekdays TEXT NOT NULL DEFAULT ''");
      }
    },
  },
  {
    version: 9,
    name: 'order_items (Mehrfachauswahl je Bestellung)',
    up() {
      db.exec(`CREATE TABLE IF NOT EXISTS order_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
        UNIQUE (order_id, menu_item_id)
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)');
      // Bestehende Einzelbestellungen als erste Position übernehmen.
      db.exec(`INSERT OR IGNORE INTO order_items (order_id, menu_item_id)
               SELECT id, menu_item_id FROM orders WHERE menu_item_id IS NOT NULL`);
    },
  },
  {
    version: 10,
    name: 'push_subscriptions & notification_log (Push-Benachrichtigungen)',
    up() {
      db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint   TEXT NOT NULL UNIQUE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
      db.exec(`CREATE TABLE IF NOT EXISTS notification_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id     INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (day_id, kind, user_id)
      )`);
    },
  },
  {
    version: 11,
    name: 'auto_plan_removed (gelöschte Auto-Tage nicht neu anlegen)',
    up() {
      db.exec('CREATE TABLE IF NOT EXISTS auto_plan_removed (date TEXT PRIMARY KEY)');
    },
  },
];

export function runMigrations({ log = () => {} } = {}) {
  const applied = [];
  const current = db.pragma('user_version', { simple: true });
  for (const m of migrations) {
    if (m.version <= current) continue;
    const tx = db.transaction(() => {
      m.up();
      db.pragma(`user_version = ${m.version}`);
    });
    tx();
    applied.push(m);
    log(`Migration ${m.version} angewendet: ${m.name}`);
  }
  return { from: current, to: db.pragma('user_version', { simple: true }), applied };
}

export function initDb() {
  db.exec(schema);
  runMigrations({ log: (msg) => console.log(`[db] ${msg}`) });
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('default_phase1_time', '10:30');
  insertSetting.run('default_phase2_time', '11:45');
  insertSetting.run('default_organizer_mode', 'manuell');
  insertSetting.run('organizer_assign_minutes', '0');
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}
