import './env.js';
import bcrypt from 'bcryptjs';
import { db, initDb, setSetting } from './db.js';
import { todayStr, zonedIso, TZ } from './util.js';

initDb();
setSetting('default_phase1_time', '10:30');
setSetting('default_phase2_time', '11:45');

const hash = (pw) => bcrypt.hashSync(pw, 10);

function upsertUser(username, displayName, password, role = 'user') {
  db.prepare(
    `INSERT INTO users (username, display_name, password_hash, role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (username) DO UPDATE SET
       display_name = excluded.display_name,
       password_hash = excluded.password_hash,
       role = excluded.role,
       is_active = 1`
  ).run(username, displayName, hash(password), role);
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
}

function upsertRestaurant(name, description, phone, website = '') {
  const existing = db.prepare('SELECT id FROM restaurants WHERE name = ?').get(name);
  if (existing) {
    db.prepare(
      'UPDATE restaurants SET description = ?, phone = ?, website = ?, is_active = 1 WHERE id = ?'
    ).run(description, phone, website, existing.id);
    return existing.id;
  }
  return db
    .prepare('INSERT INTO restaurants (name, description, phone, website) VALUES (?, ?, ?, ?)')
    .run(name, description, phone, website).lastInsertRowid;
}

function upsertItem(restaurantId, name, description, priceCents, category = '') {
  db.prepare(
    `INSERT INTO menu_items (restaurant_id, name, description, price_cents, category)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (restaurant_id, name) DO UPDATE SET
       description = excluded.description,
       price_cents = excluded.price_cents,
       category = excluded.category,
       is_active = 1`
  ).run(restaurantId, name, description, priceCents, category);
  return db
    .prepare('SELECT id FROM menu_items WHERE restaurant_id = ? AND name = ?')
    .get(restaurantId, name).id;
}

// --- Benutzer ---
const admin = upsertUser('admin', 'Administrator', 'admin123', 'admin');
const anna = upsertUser('anna', 'Anna Schmidt', 'passwort123');
const ben = upsertUser('ben', 'Ben Weber', 'passwort123');
const clara = upsertUser('clara', 'Clara Fischer', 'passwort123');

// --- Restaurants & Speisekarten ---
const pizzeria = upsertRestaurant(
  'Pizzeria Bella Italia',
  'Pizza, Pasta und Salate – Lieferung in ca. 30 Minuten.',
  '030 1234567',
  'https://bella-italia.example'
);
upsertItem(pizzeria, 'Pizza Margherita', 'Tomaten, Mozzarella, Basilikum', 850, 'Pizza');
upsertItem(pizzeria, 'Pizza Salami', 'Tomaten, Mozzarella, Salami', 950, 'Pizza');
const lasagne = upsertItem(pizzeria, 'Lasagne al Forno', 'Hausgemacht, mit Beilagensalat', 1090, 'Pasta');
upsertItem(pizzeria, 'Insalata Mista', 'Gemischter Salat mit Balsamico-Dressing', 720, 'Salate');

const asia = upsertRestaurant(
  'Asia Wok Express',
  'Frisch aus dem Wok – auch vegetarisch.',
  '030 2345678'
);
upsertItem(asia, 'Gebratene Nudeln mit Hühnchen', 'Mit Gemüse und Sojasauce', 920, 'Hauptgerichte');
upsertItem(asia, 'Ente süß-sauer', 'Mit Reis und Gemüse', 1150, 'Hauptgerichte');
upsertItem(asia, 'Gemüse-Curry', 'Vegan, mit Kokosmilch und Jasminreis', 890, 'Hauptgerichte');
upsertItem(asia, 'Frühlingsrollen (4 Stück)', 'Mit süßem Chili-Dip', 450, 'Vorspeisen');

const burger = upsertRestaurant(
  'Burger Brothers',
  'Handgemachte Burger, auch vegetarisch/vegan.',
  '030 3456789'
);
const cheeseburger = upsertItem(burger, 'Classic Cheeseburger', 'Rind, Cheddar, Salat, Tomate', 1050, 'Burger');
const bbq = upsertItem(burger, 'BBQ Bacon Burger', 'Rind, Bacon, BBQ-Sauce, Röstzwiebeln', 1200, 'Burger');
const veggie = upsertItem(burger, 'Veggie Burger', 'Gemüse-Patty, Avocado-Creme', 980, 'Burger');
upsertItem(burger, 'Süßkartoffel-Pommes', 'Mit Sour Cream', 490, 'Beilagen');

const salat = upsertRestaurant(
  'Salatwerk',
  'Bowls und Salate, ideal für die leichte Mittagspause.',
  '030 4567890'
);
upsertItem(salat, 'Caesar Salad', 'Mit Hähnchenbrust und Parmesan', 890, 'Salate');
upsertItem(salat, 'Falafel Bowl', 'Hummus, Couscous, gegrilltes Gemüse', 1020, 'Bowls');
upsertItem(salat, 'Quinoa-Salat', 'Mit Feta, Granatapfel und Minze', 960, 'Salate');

// Beispiel für ein Restaurant ohne hinterlegte Speisekarte
const imbiss = upsertRestaurant(
  'Döner-Imbiss am Markt',
  'Keine Speisekarte hinterlegt – Bestellung individuell/telefonisch.',
  '030 5678901'
);
db.prepare('UPDATE restaurants SET has_menu = 0 WHERE id = ?').run(imbiss);

// --- Gestern: abgeschlossener Beispieltag mit Bestellungen ---
const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(
  new Date(Date.now() - 86_400_000)
);
db.prepare('DELETE FROM days WHERE date = ?').run(yesterday);
const yInfo = db
  .prepare(
    `INSERT INTO days (date, organizer_id, organizer_mode, organizer_source, phase1_deadline, phase2_deadline, status, winning_restaurant_id)
     VALUES (?, ?, 'manuell', 'manuell', ?, ?, 'closed', ?)`
  )
  .run(yesterday, ben, zonedIso(yesterday, '10:30'), zonedIso(yesterday, '11:45'), burger);
const yDay = yInfo.lastInsertRowid;
const insertDayRestaurant = db.prepare(
  'INSERT INTO day_restaurants (day_id, restaurant_id, position) VALUES (?, ?, ?)'
);
[burger, pizzeria, salat].forEach((rid, i) => insertDayRestaurant.run(yDay, rid, i));
const insertVote = db.prepare(
  'INSERT INTO restaurant_votes (day_id, user_id, restaurant_id) VALUES (?, ?, ?)'
);
insertVote.run(yDay, anna, burger);
insertVote.run(yDay, ben, burger);
insertVote.run(yDay, clara, pizzeria);
const insertOrder = db.prepare(
  `INSERT INTO orders (day_id, user_id, menu_item_id, note, status) VALUES (?, ?, ?, ?, 'geliefert')`
);
insertOrder.run(yDay, anna, bbq, '');
insertOrder.run(yDay, ben, cheeseburger, 'ohne Gurke');
insertOrder.run(yDay, clara, veggie, 'Dressing extra');

// --- Heute: laufender Tag in Phase 1 ---
const today = todayStr();
db.prepare('DELETE FROM days WHERE date = ?').run(today);
let p1 = zonedIso(today, '10:30');
let p2 = zonedIso(today, '11:45');
// Liegen die Standardzeiten bereits in der Vergangenheit, wird der Demo-Tag
// relativ zur aktuellen Uhrzeit angelegt, damit Phase 1 aktiv ist.
if (Date.parse(p1) < Date.now() + 5 * 60_000) {
  p1 = new Date(Date.now() + 45 * 60_000).toISOString();
  p2 = new Date(Date.now() + 120 * 60_000).toISOString();
}
const tInfo = db
  .prepare(
    `INSERT INTO days (date, organizer_id, organizer_mode, organizer_source, phase1_deadline, phase2_deadline)
     VALUES (?, ?, 'manuell', 'manuell', ?, ?)`
  )
  .run(today, anna, p1, p2);
const tDay = tInfo.lastInsertRowid;
[pizzeria, asia, burger, salat, imbiss].forEach((rid, i) => insertDayRestaurant.run(tDay, rid, i));
insertVote.run(tDay, ben, pizzeria);
insertVote.run(tDay, admin, pizzeria);
insertVote.run(tDay, clara, asia);

// lasagne wird oben referenziert, damit die Speisekarte vollständig bleibt
void lasagne;

console.log('Seed abgeschlossen.');
console.log('');
console.log('Anmeldedaten (Benutzername / Passwort):');
console.log('  admin / admin123      (Administrator)');
console.log('  anna  / passwort123   (Benutzerin, heute Organisatorin)');
console.log('  ben   / passwort123   (Benutzer)');
console.log('  clara / passwort123   (Benutzerin)');
console.log('');
console.log(`Heutiger Tag (${today}): Phase 1 läuft bis ${new Date(Date.parse(p1)).toLocaleString('de-DE', { timeZone: TZ })}, Bestellschluss ${new Date(Date.parse(p2)).toLocaleString('de-DE', { timeZone: TZ })} (${TZ}).`);
