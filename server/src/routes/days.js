import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { ensureCurrent, resolveOpenDays } from '../dayLogic.js';
import { todayStr } from '../util.js';

export const ORDER_STATUS = ['eingegangen', 'bestellt', 'geliefert', 'storniert'];

function getDay(id) {
  return db.prepare('SELECT * FROM days WHERE id = ?').get(id);
}

function mapDay(d) {
  return {
    id: d.id,
    date: d.date,
    status: d.status,
    organizerId: d.organizer_id,
    phase1Deadline: d.phase1_deadline,
    phase2Deadline: d.phase2_deadline,
    winningRestaurantId: d.winning_restaurant_id,
  };
}

function dayRestaurantsWithVotes(dayId) {
  return db
    .prepare(
      `SELECT r.id, r.name, r.description, r.phone, r.website, COUNT(v.id) AS votes
       FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       LEFT JOIN restaurant_votes v ON v.day_id = dr.day_id AND v.restaurant_id = r.id
       WHERE dr.day_id = ?
       GROUP BY r.id
       ORDER BY dr.position ASC, dr.id ASC`
    )
    .all(dayId);
}

function menuOf(restaurantId) {
  return db
    .prepare(
      `SELECT id, name, description, price_cents AS priceCents, category, allergens
       FROM menu_items WHERE restaurant_id = ? AND is_active = 1
       ORDER BY category COLLATE NOCASE, name COLLATE NOCASE`
    )
    .all(restaurantId);
}

function myOrderOf(dayId, userId) {
  return (
    db
      .prepare(
        `SELECT o.id, o.menu_item_id AS menuItemId, o.note, o.status,
                mi.name AS itemName, mi.price_cents AS priceCents
         FROM orders o
         LEFT JOIN menu_items mi ON mi.id = o.menu_item_id
         WHERE o.day_id = ? AND o.user_id = ?`
      )
      .get(dayId, userId) || null
  );
}

function ordersOf(dayId) {
  return db
    .prepare(
      `SELECT o.id, o.user_id AS userId, u.display_name AS userName,
              o.menu_item_id AS menuItemId, mi.name AS itemName, mi.price_cents AS priceCents,
              o.note, o.status, o.updated_at AS updatedAt
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN menu_items mi ON mi.id = o.menu_item_id
       WHERE o.day_id = ?
       ORDER BY u.display_name COLLATE NOCASE`
    )
    .all(dayId);
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
    myVote:
      db
        .prepare('SELECT restaurant_id FROM restaurant_votes WHERE day_id = ? AND user_id = ?')
        .get(day.id, req.user.id)?.restaurant_id ?? null,
  };

  if (day.status !== 'phase1' && day.winning_restaurant_id) {
    payload.winner = winnerInfo(day.winning_restaurant_id);
    payload.winnerVotes =
      payload.restaurants.find((r) => r.id === day.winning_restaurant_id)?.votes ?? 0;
    payload.menu = payload.winner.hasMenu ? menuOf(day.winning_restaurant_id) : [];
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
    .prepare('SELECT 1 FROM day_restaurants WHERE day_id = ? AND restaurant_id = ?')
    .get(day.id, restaurantId);
  if (!option) {
    return res.status(400).json({ message: 'Dieses Restaurant steht heute nicht zur Wahl.' });
  }
  db.prepare(
    `INSERT INTO restaurant_votes (day_id, user_id, restaurant_id) VALUES (?, ?, ?)
     ON CONFLICT (day_id, user_id)
     DO UPDATE SET restaurant_id = excluded.restaurant_id, created_at = datetime('now')`
  ).run(day.id, req.user.id, restaurantId);
  res.json({ ok: true });
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
  const { menuItemId, note } = req.body || {};
  const item = db
    .prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1')
    .get(menuItemId);
  if (!item || item.restaurant_id !== day.winning_restaurant_id) {
    return res.status(400).json({ message: 'Bitte ein Gericht des Gewinner-Restaurants wählen.' });
  }
  db.prepare(
    `INSERT INTO orders (day_id, user_id, menu_item_id, note) VALUES (?, ?, ?, ?)
     ON CONFLICT (day_id, user_id)
     DO UPDATE SET menu_item_id = excluded.menu_item_id, note = excluded.note,
                   status = 'eingegangen', updated_at = datetime('now')`
  ).run(day.id, req.user.id, item.id, String(note || '').slice(0, 500));
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

  const byItem = new Map();
  for (const o of orders) {
    if (o.status === 'storniert') continue;
    const key = o.menuItemId ?? `deleted-${o.id}`;
    const entry = byItem.get(key) || {
      itemName: o.itemName || 'Unbekanntes Gericht',
      priceCents: o.priceCents,
      count: 0,
      users: [],
    };
    entry.count += 1;
    entry.users.push(o.userName);
    byItem.set(key, entry);
  }
  const summary = [...byItem.values()]
    .map((e) => ({ ...e, totalCents: e.priceCents != null ? e.priceCents * e.count : null }))
    .sort((a, b) => b.count - a.count || a.itemName.localeCompare(b.itemName, 'de'));
  const totalCents = orders
    .filter((o) => o.status !== 'storniert' && o.priceCents != null)
    .reduce((sum, o) => sum + o.priceCents, 0);

  res.json({
    day: mapDay(day),
    serverNow: new Date().toISOString(),
    organizerName: organizerNameOf(day),
    winner: day.winning_restaurant_id ? winnerInfo(day.winning_restaurant_id) : null,
    restaurants,
    orders,
    summary,
    totalCents,
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

// ---------- Admin: Tagesplanung ----------

daysRouter.get('/', requireAdmin, (req, res) => {
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

  let organizerId = body?.organizerId ?? null;
  if (organizerId === '' || organizerId === 0) organizerId = null;
  if (organizerId != null) {
    const u = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(organizerId);
    if (!u) return { error: 'Unbekannter Organisator.' };
    organizerId = u.id;
  }

  return {
    date,
    organizerId,
    p1Iso: new Date(p1).toISOString(),
    p2Iso: new Date(p2).toISOString(),
    restaurantIds: ids,
  };
}

const insertDayTx = db.transaction((v) => {
  const info = db
    .prepare(
      'INSERT INTO days (date, organizer_id, phase1_deadline, phase2_deadline) VALUES (?, ?, ?, ?)'
    )
    .run(v.date, v.organizerId, v.p1Iso, v.p2Iso);
  const dayId = info.lastInsertRowid;
  const insert = db.prepare(
    'INSERT INTO day_restaurants (day_id, restaurant_id, position) VALUES (?, ?, ?)'
  );
  v.restaurantIds.forEach((rid, i) => insert.run(dayId, rid, i));
  return dayId;
});

daysRouter.post('/', requireAdmin, (req, res) => {
  const v = validateDayInput(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  const dayId = insertDayTx(v);
  const day = ensureCurrent(getDay(dayId));
  res.status(201).json({ day: mapDay(day) });
});

const updateDayTx = db.transaction((dayId, v) => {
  // Status und Gewinner werden anschließend aus den (neuen) Deadlines abgeleitet.
  db.prepare(
    `UPDATE days SET date = ?, organizer_id = ?, phase1_deadline = ?, phase2_deadline = ?,
       status = 'phase1', winning_restaurant_id = NULL
     WHERE id = ?`
  ).run(v.date, v.organizerId, v.p1Iso, v.p2Iso, dayId);
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

daysRouter.put('/:id', requireAdmin, (req, res) => {
  const day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
  const v = validateDayInput(req.body, day.id);
  if (v.error) return res.status(400).json({ message: v.error });
  updateDayTx(day.id, v);
  const updated = ensureCurrent(getDay(day.id));
  res.json({ day: mapDay(updated) });
});

daysRouter.delete('/:id', requireAdmin, (req, res) => {
  const day = getDay(req.params.id);
  if (!day) return res.status(404).json({ message: 'Tag nicht gefunden.' });
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
