import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin, requirePlanner } from '../auth.js';
import { ensureCurrent, resolveOpenDays } from '../dayLogic.js';
import { todayStr, isoWeekday } from '../util.js';
import {
  generateAutoPlan,
  getAutoPlanConfig,
  regenerateAutoPlan,
  setAutoPlanConfig,
  suppressAutoDate,
  unsuppressAutoDate,
} from '../autoPlan.js';
import { parseWeekdayCsv, weekdaysAllow } from '../weekdayParse.js';
import { notifyOrganizerAssigned } from '../push.js';

export const ORDER_STATUS = ['eingegangen', 'bestellt', 'geliefert', 'storniert'];

function getDay(id) {
  return db.prepare('SELECT * FROM days WHERE id = ?').get(id);
}

export const ORGANIZER_MODES = ['manuell', 'freiwillig', 'zufaellig'];

function mapDay(d) {
  return {
    id: d.id,
    date: d.date,
    status: d.status,
    organizerId: d.organizer_id,
    organizerMode: d.organizer_mode,
    organizerSource: d.organizer_source,
    phase1Deadline: d.phase1_deadline,
    phase2Deadline: d.phase2_deadline,
    winningRestaurantId: d.winning_restaurant_id,
    autoCreated: !!d.auto_created,
  };
}

// Abstimmbare Restaurants (mit Speisekarte). Restaurants ohne Speisekarte
// (Supermärkte) nehmen nicht an der Abstimmung teil – siehe participationOptionsOf.
// Enthält je Restaurant die Namen der Abstimmenden (`voters`) – nur für
// angemeldete Nutzer, die ohnehin Zugriff auf die Tagesabstimmung haben.
function dayRestaurantsWithVotes(dayId) {
  const rows = db
    .prepare(
      `SELECT r.id, r.name, r.description, r.phone, r.website, COUNT(v.id) AS votes
       FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       LEFT JOIN restaurant_votes v ON v.day_id = dr.day_id AND v.restaurant_id = r.id
       WHERE dr.day_id = ? AND r.has_menu = 1
       GROUP BY r.id
       ORDER BY dr.position ASC, dr.id ASC`
    )
    .all(dayId);
  const voters = db
    .prepare(
      `SELECT v.restaurant_id AS rid, u.display_name AS name
       FROM restaurant_votes v
       JOIN users u ON u.id = v.user_id
       WHERE v.day_id = ?
       ORDER BY u.display_name COLLATE NOCASE`
    )
    .all(dayId);
  const byRestaurant = new Map();
  for (const v of voters) {
    if (!byRestaurant.has(v.rid)) byRestaurant.set(v.rid, []);
    byRestaurant.get(v.rid).push(v.name);
  }
  return rows.map((r) => ({ ...r, voters: byRestaurant.get(r.id) || [] }));
}

// Teilnahme-Optionen: Restaurants OHNE Speisekarte, die an dem Tag zur Auswahl
// stehen. Je Option die (unverbindlich) teilnehmenden Personen. Getrennt von
// den Bestellungen; fließt nicht in Sammelbestellung/Bezahlt-Status ein.
function participationOptionsOf(dayId, userId = null) {
  const options = db
    .prepare(
      `SELECT r.id, r.name, r.description, r.phone, r.website
       FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       WHERE dr.day_id = ? AND r.has_menu = 0
       ORDER BY dr.position ASC, dr.id ASC`
    )
    .all(dayId);
  const partStmt = db.prepare(
    `SELECT p.user_id AS userId, u.display_name AS userName
     FROM day_participations p
     JOIN users u ON u.id = p.user_id
     WHERE p.day_id = ? AND p.restaurant_id = ?
     ORDER BY u.display_name COLLATE NOCASE`
  );
  return options.map((o) => {
    const parts = partStmt.all(dayId, o.id);
    return {
      id: o.id,
      name: o.name,
      description: o.description,
      phone: o.phone,
      website: o.website,
      participants: parts.map((p) => p.userName),
      count: parts.length,
      iParticipate: userId != null && parts.some((p) => p.userId === userId),
    };
  });
}

// Speisekarte des Restaurants. Ist ein Wochentag angegeben, werden an diesen
// Wochentag gebundene Gerichte (Tagesessen) ausgefiltert, die dort nicht gelten.
function menuOf(restaurantId, weekday = null) {
  return db
    .prepare(
      `SELECT id, name, description, price_cents AS priceCents, category, allergens, weekdays
       FROM menu_items WHERE restaurant_id = ? AND is_active = 1
       ORDER BY category COLLATE NOCASE, name COLLATE NOCASE`
    )
    .all(restaurantId)
    .filter((it) => weekday == null || weekdaysAllow(it.weekdays, weekday))
    .map((it) => ({ ...it, weekdays: parseWeekdayCsv(it.weekdays) }));
}

// Einzelpositionen einer Bestellung (Mehrfachauswahl). Preis/Name werden live
// aus menu_items gelesen; gelöschte Gerichte erscheinen als „Unbekanntes Gericht".
function itemsOfOrder(orderId) {
  return db
    .prepare(
      `SELECT oi.menu_item_id AS menuItemId, mi.name AS itemName, mi.price_cents AS priceCents,
              mi.category AS category
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = ?
       ORDER BY mi.category COLLATE NOCASE, mi.name COLLATE NOCASE`
    )
    .all(orderId);
}

function sumItems(items) {
  return items.reduce((s, it) => (it.priceCents != null ? s + it.priceCents : s), 0);
}

function myOrderOf(dayId, userId) {
  const order = db
    .prepare('SELECT id, note, status FROM orders WHERE day_id = ? AND user_id = ?')
    .get(dayId, userId);
  if (!order) return null;
  const items = itemsOfOrder(order.id);
  return { id: order.id, note: order.note, status: order.status, items, totalCents: sumItems(items) };
}

function ordersOf(dayId) {
  return db
    .prepare(
      `SELECT o.id, o.user_id AS userId, u.display_name AS userName,
              o.note, o.status, o.paid, o.updated_at AS updatedAt
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.day_id = ?
       ORDER BY u.display_name COLLATE NOCASE`
    )
    .all(dayId)
    .map((o) => {
      const items = itemsOfOrder(o.id);
      return { ...o, paid: !!o.paid, items, totalCents: sumItems(items) };
    });
}

function isOrganizerOrAdmin(user, day) {
  return user.role === 'admin' || day.organizer_id === user.id;
}

function organizerNameOf(day) {
  if (!day.organizer_id) return null;
  const row = db.prepare('SELECT display_name FROM users WHERE id = ?').get(day.organizer_id);
  return row ? row.display_name : null;
}

function winnerInfo(restaurantId) {
  const r = db
    .prepare('SELECT id, name, description, phone, website, has_menu FROM restaurants WHERE id = ?')
    .get(restaurantId);
  if (!r) return null;
  return { id: r.id, name: r.name, description: r.description, phone: r.phone, website: r.website, hasMenu: !!r.has_menu };
}

export const daysRouter = Router();
daysRouter.use(requireAuth);

// ---------- Für alle angemeldeten Benutzer ----------

daysRouter.get('/today', (req, res) => {
  const serverNow = new Date().toISOString();
  let day = db.prepare('SELECT * FROM days WHERE date = ?').get(todayStr());
  if (!day) return res.json({ day: null, serverNow });
  day = ensureCurrent(day);

  const payload = {
    day: mapDay(day),
    serverNow,
    organizerName: organizerNameOf(day),
    isOrganizer: isOrganizerOrAdmin(req.user, day),
    restaurants: dayRestaurantsWithVotes(day.id),
    participationOptions: participationOptionsOf(day.id, req.user.id),
    myVote:
      db
        .prepare('SELECT restaurant_id FROM restaurant_votes WHERE day_id = ? AND user_id = ?')
        .get(day.id, req.user.id)?.restaurant_id ?? null,
  };

  if (day.status !== 'phase1' && day.winning_restaurant_id) {
    payload.winner = winnerInfo(day.winning_restaurant_id);
    payload.winnerVotes =
      payload.restaurants.find((r) => r.id === day.winning_restaurant_id)?.votes ?? 0;
    payload.menu = payload.winner.hasMenu
      ? menuOf(day.winning_restaurant_id, isoWeekday(day.date))
      : [];
    payload.myOrder = myOrderOf(day.id, req.user.id);
    payload.orderCount = db
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE day_id = ? AND status != 'storniert'")
      .get(day.id).n;
  }
  res.json(payload);
});

daysRouter.post('/:id/vote', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.status !== 'phase1') {
    return res.status(409).json({ message: 'Die Restaurant-Abstimmung ist bereits beendet.' });
  }
  const { restaurantId } = req.body || {};
  const option = db
    .prepare(
      `SELECT r.has_menu FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       WHERE dr.day_id = ? AND dr.restaurant_id = ?`
    )
    .get(day.id, restaurantId);
  if (!option) {
    return res.status(400).json({ message: 'Dieses Restaurant steht heute nicht zur Wahl.' });
  }
  if (!option.has_menu) {
    return res.status(400).json({
      message: 'Für diesen Ort wird nicht abgestimmt – bitte über die Teilnahmeliste eintragen.',
    });
  }
  db.prepare(
    `INSERT INTO restaurant_votes (day_id, user_id, restaurant_id) VALUES (?, ?, ?)
     ON CONFLICT (day_id, user_id)
     DO UPDATE SET restaurant_id = excluded.restaurant_id, created_at = datetime('now')`
  ).run(day.id, req.user.id, restaurantId);
  res.json({ ok: true });
});

// Glücksrad: der Server wählt zufällig eines der abstimmbaren Restaurants und
// verbucht die Stimme SOFORT. Die Animation im Client führt anschließend nur
// noch auf dieses bereits feststehende Ergebnis hin – sie kann es nicht
// beeinflussen. Ein zweiter Dreh ist nicht möglich (409), solange eine Stimme
// vorliegt; damit lässt sich das Ergebnis auch nicht „nachwürfeln".
daysRouter.post('/:id/vote/random', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.status !== 'phase1') {
    return res.status(409).json({ message: 'Die Restaurant-Abstimmung ist bereits beendet.' });
  }
  const existing = db
    .prepare('SELECT restaurant_id FROM restaurant_votes WHERE day_id = ? AND user_id = ?')
    .get(day.id, req.user.id);
  if (existing) {
    return res
      .status(409)
      .json({ message: 'Du hast bereits abgestimmt – das Glücksrad gibt es nur einmal pro Tag.' });
  }
  const options = db
    .prepare(
      `SELECT dr.restaurant_id AS id FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       WHERE dr.day_id = ? AND r.has_menu = 1
       ORDER BY dr.position ASC, dr.id ASC`
    )
    .all(day.id);
  if (options.length === 0) {
    return res.status(409).json({ message: 'Heute steht kein Restaurant zur Wahl.' });
  }
  // crypto.randomInt statt Math.random: gleichverteilt und nicht vorhersagbar.
  const winner = options[randomInt(options.length)].id;
  db.prepare(
    'INSERT INTO restaurant_votes (day_id, user_id, restaurant_id) VALUES (?, ?, ?)'
  ).run(day.id, req.user.id, winner);
  res.json({ restaurantId: winner });
});

daysRouter.delete('/:id/vote', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.status !== 'phase1') {
    return res.status(409).json({ message: 'Die Restaurant-Abstimmung ist bereits beendet.' });
  }
  db.prepare('DELETE FROM restaurant_votes WHERE day_id = ? AND user_id = ?').run(
    day.id,
    req.user.id
  );
  res.json({ ok: true });
});

// Bestellung (Kopf) anlegen/aktualisieren und die Positionen ersetzen.
const placeOrderTx = db.transaction((dayId, userId, itemIds, note) => {
  db.prepare(
    `INSERT INTO orders (day_id, user_id, menu_item_id, note) VALUES (?, ?, ?, ?)
     ON CONFLICT (day_id, user_id)
     DO UPDATE SET menu_item_id = excluded.menu_item_id, note = excluded.note,
                   status = 'eingegangen', updated_at = datetime('now')`
  ).run(dayId, userId, itemIds[0], note);
  const order = db
    .prepare('SELECT id FROM orders WHERE day_id = ? AND user_id = ?')
    .get(dayId, userId);
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(order.id);
  const ins = db.prepare('INSERT OR IGNORE INTO order_items (order_id, menu_item_id) VALUES (?, ?)');
  for (const id of itemIds) ins.run(order.id, id);
  return order.id;
});

daysRouter.post('/:id/order', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.status === 'phase1') {
    return res.status(409).json({ message: 'Die Essensauswahl ist noch nicht freigeschaltet.' });
  }
  if (day.status === 'closed') {
    return res.status(409).json({ message: 'Die Bestellphase ist bereits beendet.' });
  }
  const winner = winnerInfo(day.winning_restaurant_id);
  if (winner && !winner.hasMenu) {
    return res.status(409).json({
      message: 'Für dieses Restaurant ist keine Speisekarte hinterlegt – bitte individuell bestellen.',
    });
  }
  const body = req.body || {};
  // Mehrfachauswahl: menuItemIds[] (mehrere Gerichte). Einzelnes menuItemId
  // wird weiterhin akzeptiert (Abwärtskompatibilität).
  const rawIds = Array.isArray(body.menuItemIds)
    ? body.menuItemIds
    : body.menuItemId != null
      ? [body.menuItemId]
      : [];
  const ids = [...new Set(rawIds.map(Number))].filter(Number.isInteger);
  if (ids.length === 0) {
    return res.status(400).json({ message: 'Bitte mindestens ein Gericht wählen.' });
  }
  if (ids.length > 20) {
    return res.status(400).json({ message: 'Zu viele Gerichte in einer Bestellung.' });
  }
  const weekday = isoWeekday(day.date);
  for (const id of ids) {
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1').get(id);
    if (!item || item.restaurant_id !== day.winning_restaurant_id) {
      return res.status(400).json({ message: 'Bitte nur Gerichte des Gewinner-Restaurants wählen.' });
    }
    // Tagesessen sind nur an ihren Wochentagen bestellbar (serverseitige Prüfung).
    if (!weekdaysAllow(item.weekdays, weekday)) {
      return res
        .status(409)
        .json({ message: `„${item.name}" ist an diesem Wochentag nicht verfügbar.` });
    }
  }
  placeOrderTx(day.id, req.user.id, ids, String(body.note || '').slice(0, 500));
  res.json({ order: myOrderOf(day.id, req.user.id) });
});

daysRouter.delete('/:id/order', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.status !== 'phase2') {
    return res.status(409).json({ message: 'Die Bestellphase ist nicht aktiv.' });
  }
  db.prepare('DELETE FROM orders WHERE day_id = ? AND user_id = ?').run(day.id, req.user.id);
  res.json({ ok: true });
});

// ---------- Teilnahme (Restaurants ohne Speisekarte, z. B. Supermärkte) ----------
// Unverbindliches „Ich gehe mit". Ein-/Austragen bis der Tag vorbei ist
// (heute/zukünftig) – bewusst großzügiger als der Bestellschluss, da man
// spontan entscheidet. Getrennt von den Bestellungen.

function participationOption(dayId, restaurantId) {
  return db
    .prepare(
      `SELECT r.has_menu FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       WHERE dr.day_id = ? AND dr.restaurant_id = ?`
    )
    .get(dayId, restaurantId);
}

daysRouter.post('/:id/participation', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.date < todayStr()) {
    return res.status(409).json({ message: 'Dieser Tag ist bereits vorbei.' });
  }
  const { restaurantId } = req.body || {};
  const opt = participationOption(day.id, restaurantId);
  if (!opt) {
    return res.status(400).json({ message: 'Dieser Ort steht heute nicht zur Auswahl.' });
  }
  if (opt.has_menu) {
    return res.status(400).json({ message: 'Für dieses Restaurant bitte regulär bestellen.' });
  }
  db.prepare(
    'INSERT OR IGNORE INTO day_participations (day_id, restaurant_id, user_id) VALUES (?, ?, ?)'
  ).run(day.id, restaurantId, req.user.id);
  res.json({ ok: true });
});

daysRouter.delete('/:id/participation', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.date < todayStr()) {
    return res.status(409).json({ message: 'Dieser Tag ist bereits vorbei.' });
  }
  const { restaurantId } = req.body || {};
  db.prepare(
    'DELETE FROM day_participations WHERE day_id = ? AND restaurant_id = ? AND user_id = ?'
  ).run(day.id, restaurantId, req.user.id);
  res.json({ ok: true });
});

// Speisekarte eines zur Wahl stehenden Restaurants (für das Vorschau-Popup in
// Phase 1). Tagesessen werden für den Wochentag des Tages gefiltert (gleiche
// Logik wie die Bestellung). Für Restaurants ohne Speisekarte leere Liste.
daysRouter.get('/:id/menu/:restaurantId', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  const rid = Number(req.params.restaurantId);
  const opt = db
    .prepare(
      `SELECT r.id, r.name, r.description, r.phone, r.website, r.has_menu
       FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       WHERE dr.day_id = ? AND dr.restaurant_id = ?`
    )
    .get(day.id, rid);
  if (!opt) {
    return res.status(404).json({ message: 'Dieses Restaurant steht heute nicht zur Wahl.' });
  }
  res.json({
    restaurant: {
      id: opt.id,
      name: opt.name,
      description: opt.description,
      phone: opt.phone,
      website: opt.website,
      hasMenu: !!opt.has_menu,
    },
    menu: opt.has_menu ? menuOf(rid, isoWeekday(day.date)) : [],
  });
});

// ---------- Freiwillige Organisator-Meldung ----------

daysRouter.post('/:id/volunteer', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.organizer_mode !== 'freiwillig') {
    return res.status(409).json({ message: 'Für diesen Tag ist keine freiwillige Meldung vorgesehen.' });
  }
  if (day.status === 'closed') {
    return res.status(409).json({ message: 'Dieser Tag ist bereits abgeschlossen.' });
  }
  if (day.organizer_id != null) {
    return res.status(409).json({ message: 'Es ist bereits jemand als Organisator eingetragen.' });
  }
  const hasOrder = db
    .prepare("SELECT 1 FROM orders WHERE day_id = ? AND user_id = ? AND status != 'storniert'")
    .get(day.id, req.user.id);
  if (!hasOrder) {
    return res.status(409).json({ message: 'Bitte zuerst bestellen – nur Mitbesteller können organisieren.' });
  }
  const info = db
    .prepare(
      "UPDATE days SET organizer_id = ?, organizer_source = 'freiwillig' WHERE id = ? AND organizer_id IS NULL"
    )
    .run(req.user.id, day.id);
  if (info.changes === 0) {
    return res.status(409).json({ message: 'Jemand anderes war schneller – der Platz ist bereits vergeben.' });
  }
  notifyOrganizerAssigned(day, req.user.id);
  res.json({ ok: true });
});

daysRouter.delete('/:id/volunteer', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.organizer_id !== req.user.id || day.organizer_source !== 'freiwillig') {
    return res.status(409).json({ message: 'Du bist nicht als freiwilliger Organisator eingetragen.' });
  }
  if (day.status === 'closed') {
    return res.status(409).json({ message: 'Dieser Tag ist bereits abgeschlossen.' });
  }
  db.prepare('UPDATE days SET organizer_id = NULL, organizer_source = NULL WHERE id = ?').run(day.id);
  res.json({ ok: true });
});

// ---------- Organisator / Admin ----------

daysRouter.get('/:id/full', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (!isOrganizerOrAdmin(req.user, day)) {
    return res.status(403).json({ message: 'Nur für den Organisator oder Administratoren.' });
  }
  const restaurants = dayRestaurantsWithVotes(day.id);
  const orders = ordersOf(day.id);

  // Sammelbestellung: je Gericht über alle (nicht stornierten) Bestellungen.
  // Eine Person mit mehreren Gerichten zählt bei jedem ihrer Gerichte mit.
  const byItem = new Map();
  for (const o of orders) {
    if (o.status === 'storniert') continue;
    for (const it of o.items) {
      const key = it.menuItemId ?? `deleted-${it.itemName || '?'}`;
      const entry = byItem.get(key) || {
        itemName: it.itemName || 'Unbekanntes Gericht',
        // Gelöschte Gerichte liefern category = null (ON DELETE SET NULL) –
        // '' hält den localeCompare unten sicher.
        category: it.category || '',
        priceCents: it.priceCents,
        count: 0,
        users: [],
      };
      entry.count += 1;
      entry.users.push(o.userName);
      byItem.set(key, entry);
    }
  }
  // Häufigste Gerichte zuerst (so wird die Liste durchtelefoniert); bei
  // Gleichstand nach Kategorie, dann Name – passend zur Anzeige „Kategorie · Name".
  const summary = [...byItem.values()]
    .map((e) => ({ ...e, totalCents: e.priceCents != null ? e.priceCents * e.count : null }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.category.localeCompare(b.category, 'de') ||
        a.itemName.localeCompare(b.itemName, 'de')
    );

  // Bezahlt-Übersicht (stornierte Bestellungen zählen nicht mit); Beträge je
  // Bestellung = Summe ihrer Gerichte.
  const active = orders.filter((o) => o.status !== 'storniert');
  const totalCents = active.reduce((sum, o) => sum + o.totalCents, 0);
  const paidStats = {
    paidCount: active.filter((o) => o.paid).length,
    totalCount: active.length,
    paidCents: active.filter((o) => o.paid).reduce((s, o) => s + o.totalCents, 0),
    openCents: active.filter((o) => !o.paid).reduce((s, o) => s + o.totalCents, 0),
  };

  // Alle Restaurant-Optionen des Tages (inkl. „ohne Speisekarte") in
  // Anzeige-Reihenfolge – für die Vorbelegung des Bearbeiten-Formulars.
  // (restaurants oben enthält nur die abstimmbaren Restaurants mit Speisekarte.)
  const restaurantIds = db
    .prepare(
      'SELECT restaurant_id FROM day_restaurants WHERE day_id = ? ORDER BY position ASC, id ASC'
    )
    .all(day.id)
    .map((r) => r.restaurant_id);

  res.json({
    day: mapDay(day),
    serverNow: new Date().toISOString(),
    organizerName: organizerNameOf(day),
    winner: day.winning_restaurant_id ? winnerInfo(day.winning_restaurant_id) : null,
    restaurants,
    restaurantIds,
    orders,
    summary,
    totalCents,
    paidStats,
    // Rein informativ, getrennt von der Sammelbestellung/Bezahlt-Logik.
    participationOptions: participationOptionsOf(day.id),
  });
});

daysRouter.patch('/:id/orders-status', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (!isOrganizerOrAdmin(req.user, day)) {
    return res.status(403).json({ message: 'Nur für den Organisator oder Administratoren.' });
  }
  const { status } = req.body || {};
  if (!ORDER_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Ungültiger Status.' });
  }
  db.prepare(
    `UPDATE orders SET status = ?, updated_at = datetime('now')
     WHERE day_id = ? AND status != 'storniert'`
  ).run(status, day.id);
  res.json({ ok: true });
});

// Sammelaktion: alle (nicht stornierten) Bestellungen des Tages als
// bezahlt/offen markieren.
daysRouter.patch('/:id/orders-paid', (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (!isOrganizerOrAdmin(req.user, day)) {
    return res.status(403).json({ message: 'Nur für den Organisator oder Administratoren.' });
  }
  const paid = req.body?.paid ? 1 : 0;
  db.prepare(
    `UPDATE orders SET paid = ?, updated_at = datetime('now')
     WHERE day_id = ? AND status != 'storniert'`
  ).run(paid, day.id);
  res.json({ ok: true });
});

// Restaurant des Tages manuell festlegen (Planung/Admin). Gedacht für den
// Fall, dass niemand abgestimmt hat und deshalb kein Gewinner ermittelt
// wurde; erlaubt aber auch eine spätere Korrektur. Zulässig sind nur
// Restaurants, die an dem Tag zur Wahl standen und eine Speisekarte haben.
daysRouter.patch('/:id/winner', requirePlanner, (req, res) => {
  let day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  day = ensureCurrent(day);
  if (day.status === 'phase1') {
    return res
      .status(409)
      .json({ message: 'Die Abstimmung läuft noch – das Ergebnis steht noch nicht fest.' });
  }
  const restaurantId = Number(req.body?.restaurantId);
  const option = db
    .prepare(
      `SELECT r.id FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       WHERE dr.day_id = ? AND dr.restaurant_id = ? AND r.has_menu = 1`
    )
    .get(day.id, restaurantId);
  if (!option) {
    return res
      .status(400)
      .json({ message: 'Dieses Restaurant stand an dem Tag nicht mit Speisekarte zur Wahl.' });
  }
  db.prepare('UPDATE days SET winning_restaurant_id = ? WHERE id = ?').run(restaurantId, day.id);
  res.json({ day: mapDay(db.prepare('SELECT * FROM days WHERE id = ?').get(day.id)) });
});

// ---------- Admin: Tagesplanung ----------

daysRouter.get('/', requirePlanner, (req, res) => {
  resolveOpenDays();
  const rows = db
    .prepare(
      `SELECT d.*, u.display_name AS organizer_name, r.name AS winner_name,
         (SELECT COUNT(*) FROM restaurant_votes v WHERE v.day_id = d.id) AS vote_count,
         (SELECT COUNT(*) FROM orders o WHERE o.day_id = d.id AND o.status != 'storniert') AS order_count
       FROM days d
       LEFT JOIN users u ON u.id = d.organizer_id
       LEFT JOIN restaurants r ON r.id = d.winning_restaurant_id
       ORDER BY d.date DESC
       LIMIT 90`
    )
    .all();
  res.json({
    days: rows.map((d) => ({
      ...mapDay(d),
      organizerName: d.organizer_name,
      winnerName: d.winner_name,
      voteCount: d.vote_count,
      orderCount: d.order_count,
    })),
    today: todayStr(),
  });
});

// ---------- Admin/Planung: Automatische Tagesplanung ----------
// Vor den /:id-Routen definiert, damit „auto-plan" nicht als :id gedeutet wird.

daysRouter.get('/auto-plan', requirePlanner, (req, res) => {
  res.json({ config: getAutoPlanConfig() });
});

daysRouter.put('/auto-plan', requirePlanner, (req, res) => {
  const { config, error } = setAutoPlanConfig(req.body);
  if (error) return res.status(400).json({ message: error });
  // Speichern erzeugt die betroffenen (sicher ersetzbaren) Zukunfts-Auto-Tage
  // neu; geschützte Tage (manuell/Bestellungen) bleiben erhalten.
  const regenerated = regenerateAutoPlan();
  res.json({ config, regenerated });
});

daysRouter.post('/auto-plan/run', requirePlanner, (req, res) => {
  const summary = generateAutoPlan();
  res.json(summary);
});

function validateDayInput(body, existingId = null) {
  const date = String(body?.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Ungültiges Datum.' };
  const duplicate = db
    .prepare('SELECT id FROM days WHERE date = ? AND id IS NOT ?')
    .get(date, existingId);
  if (duplicate) return { error: 'Für dieses Datum existiert bereits eine Planung.' };

  const p1 = Date.parse(body?.phase1Deadline);
  const p2 = Date.parse(body?.phase2Deadline);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return { error: 'Ungültige Uhrzeiten.' };
  if (p1 >= p2) {
    return { error: 'Das Ende der Essensauswahl muss nach dem Ende der Restaurantwahl liegen.' };
  }

  const ids = [...new Set((body?.restaurantIds || []).map(Number))].filter(Number.isInteger);
  if (ids.length < 1) return { error: 'Bitte mindestens ein Restaurant auswählen.' };
  const known = db
    .prepare(
      `SELECT COUNT(*) AS n FROM restaurants WHERE id IN (${ids.map(() => '?').join(',')})`
    )
    .get(...ids).n;
  if (known !== ids.length) return { error: 'Unbekanntes Restaurant in der Auswahl.' };

  const organizerMode = ORGANIZER_MODES.includes(body?.organizerMode)
    ? body.organizerMode
    : 'manuell';

  let organizerId = body?.organizerId ?? null;
  if (organizerId === '' || organizerId === 0 || organizerMode !== 'manuell') organizerId = null;
  if (organizerId != null) {
    const u = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(organizerId);
    if (!u) return { error: 'Unbekannter Organisator.' };
    organizerId = u.id;
  }

  return {
    date,
    organizerId,
    organizerMode,
    p1Iso: new Date(p1).toISOString(),
    p2Iso: new Date(p2).toISOString(),
    restaurantIds: ids,
  };
}

const insertDayTx = db.transaction((v) => {
  const info = db
    .prepare(
      `INSERT INTO days (date, organizer_id, organizer_mode, organizer_source, phase1_deadline, phase2_deadline)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      v.date,
      v.organizerId,
      v.organizerMode,
      v.organizerId != null ? 'manuell' : null,
      v.p1Iso,
      v.p2Iso
    );
  const dayId = info.lastInsertRowid;
  const insert = db.prepare(
    'INSERT INTO day_restaurants (day_id, restaurant_id, position) VALUES (?, ?, ?)'
  );
  v.restaurantIds.forEach((rid, i) => insert.run(dayId, rid, i));
  return dayId;
});

daysRouter.post('/', requirePlanner, (req, res) => {
  const v = validateDayInput(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  const dayId = insertDayTx(v);
  // Manuell (wieder) angelegtes Datum ist nicht mehr von der Automatik gesperrt.
  unsuppressAutoDate(v.date);
  const day = ensureCurrent(getDay(dayId));
  if (day.organizer_id) notifyOrganizerAssigned(day, day.organizer_id);
  res.status(201).json({ day: mapDay(day) });
});

const updateDayTx = db.transaction((day, v) => {
  // Organisator je nach Modus: manuell aus dem Formular; bei automatischen
  // Modi bleibt eine bereits erfolgte (freiwillige/zufällige) Zuweisung
  // erhalten, solange der Modus unverändert ist.
  let organizerId = null;
  let organizerSource = null;
  if (v.organizerMode === 'manuell') {
    organizerId = v.organizerId;
    organizerSource = v.organizerId != null ? 'manuell' : null;
  } else if (day.organizer_mode === v.organizerMode && day.organizer_source !== 'manuell') {
    organizerId = day.organizer_id;
    organizerSource = day.organizer_id != null ? day.organizer_source : null;
  }

  // Status und Gewinner werden anschließend aus den (neuen) Deadlines abgeleitet.
  // auto_created = 0: eine manuelle Bearbeitung „schützt" den Tag vor der
  // automatischen Neuerzeugung (er gilt fortan als manuell gepflegt).
  db.prepare(
    `UPDATE days SET date = ?, organizer_id = ?, organizer_mode = ?, organizer_source = ?,
       phase1_deadline = ?, phase2_deadline = ?, status = 'phase1', winning_restaurant_id = NULL,
       auto_created = 0
     WHERE id = ?`
  ).run(v.date, organizerId, v.organizerMode, organizerSource, v.p1Iso, v.p2Iso, day.id);
  const dayId = day.id;
  db.prepare('DELETE FROM day_restaurants WHERE day_id = ?').run(dayId);
  const insert = db.prepare(
    'INSERT INTO day_restaurants (day_id, restaurant_id, position) VALUES (?, ?, ?)'
  );
  v.restaurantIds.forEach((rid, i) => insert.run(dayId, rid, i));
  // Stimmen für Restaurants entfernen, die nicht mehr zur Wahl stehen.
  db.prepare(
    `DELETE FROM restaurant_votes
     WHERE day_id = ? AND restaurant_id NOT IN (${v.restaurantIds.map(() => '?').join(',')})`
  ).run(dayId, ...v.restaurantIds);
});

daysRouter.put('/:id', requirePlanner, (req, res) => {
  const day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  const v = validateDayInput(req.body, day.id);
  if (v.error) return res.status(400).json({ message: v.error });
  updateDayTx(day, v);
  const updated = ensureCurrent(getDay(day.id));
  if (updated.organizer_id) notifyOrganizerAssigned(updated, updated.organizer_id);
  res.json({ day: mapDay(updated) });
});

daysRouter.delete('/:id', requirePlanner, (req, res) => {
  const day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  // Löschen eines heutigen/künftigen Tages sperrt das Datum, damit die
  // Automatik es nicht erneut anlegt (Problem A: Löschen „hält" jetzt).
  if (day.date >= todayStr()) suppressAutoDate(day.date);
  // Stimmen und Bestellungen des Tages werden mitgelöscht (ON DELETE CASCADE).
  db.prepare('DELETE FROM days WHERE id = ?').run(day.id);
  res.json({ ok: true });
});

// ---------- Bestellstatus einzelner Bestellungen ----------

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.patch('/:id/status', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ message: 'Bestellung nicht gefunden.' });
  const day = getDay(order.day_id);
  if (!isOrganizerOrAdmin(req.user, day)) {
    return res.status(403).json({ message: 'Nur für den Organisator oder Administratoren.' });
  }
  const { status } = req.body || {};
  if (!ORDER_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Ungültiger Status.' });
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    order.id
  );
  res.json({ ok: true });
});

// Bezahlt-Status einer einzelnen Bestellung (Organisator des Tages oder Admin).
ordersRouter.patch('/:id/paid', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ message: 'Bestellung nicht gefunden.' });
  const day = getDay(order.day_id);
  if (!isOrganizerOrAdmin(req.user, day)) {
    return res.status(403).json({ message: 'Nur für den Organisator oder Administratoren.' });
  }
  const paid = req.body?.paid ? 1 : 0;
  db.prepare("UPDATE orders SET paid = ?, updated_at = datetime('now') WHERE id = ?").run(
    paid,
    order.id
  );
  res.json({ ok: true });
});
