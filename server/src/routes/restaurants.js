import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { parseMenuCsv } from '../csv.js';

function mapRestaurant(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    phone: r.phone,
    website: r.website,
    hasMenu: !!r.has_menu,
    isActive: !!r.is_active,
    menuCount: r.menu_count,
  };
}

function mapItem(i) {
  return {
    id: i.id,
    restaurantId: i.restaurant_id,
    name: i.name,
    description: i.description,
    priceCents: i.price_cents,
    category: i.category,
    allergens: i.allergens,
    isActive: !!i.is_active,
  };
}

export const restaurantsRouter = Router();
restaurantsRouter.use(requireAuth);

restaurantsRouter.get('/', (req, res) => {
  const includeInactive = req.user.role === 'admin' && req.query.all === '1';
  const rows = db
    .prepare(
      `SELECT r.*,
         (SELECT COUNT(*) FROM menu_items mi WHERE mi.restaurant_id = r.id AND mi.is_active = 1) AS menu_count
       FROM restaurants r
       ${includeInactive ? '' : 'WHERE r.is_active = 1'}
       ORDER BY r.name COLLATE NOCASE`
    )
    .all();
  res.json({ restaurants: rows.map(mapRestaurant) });
});

restaurantsRouter.get('/:id/menu', (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ message: 'Restaurant nicht gefunden.' });
  const includeInactive = req.user.role === 'admin' && req.query.all === '1';
  const items = db
    .prepare(
      `SELECT * FROM menu_items WHERE restaurant_id = ?
       ${includeInactive ? '' : 'AND is_active = 1'}
       ORDER BY category COLLATE NOCASE, name COLLATE NOCASE`
    )
    .all(restaurant.id);
  res.json({ restaurant: mapRestaurant(restaurant), items: items.map(mapItem) });
});

// Website-URL absichern (M1): Die Adresse wird allen Nutzern als anklickbarer
// Link angezeigt. Nur http(s) zulassen, damit keine gefährlichen Schemata
// (javascript:, data:, …) als Stored-XSS-Vektor gespeichert werden können.
function sanitizeWebsite(raw) {
  const value = String(raw || '').trim();
  if (!value) return { website: '' };
  let u;
  try {
    u = new URL(value);
  } catch {
    return { error: 'Website: bitte eine vollständige URL angeben (z. B. https://…).' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'Website: nur http(s)-Adressen sind erlaubt.' };
  }
  return { website: u.toString() };
}

function validateRestaurantInput(body) {
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Bitte einen Namen angeben.' };
  const web = sanitizeWebsite(body?.website);
  if (web.error) return { error: web.error };
  return {
    name,
    description: String(body?.description || '').trim(),
    phone: String(body?.phone || '').trim(),
    website: web.website,
  };
}

restaurantsRouter.post('/', requireAdmin, (req, res) => {
  const v = validateRestaurantInput(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  const hasMenu = req.body?.hasMenu === undefined ? 1 : req.body.hasMenu ? 1 : 0;
  const info = db
    .prepare('INSERT INTO restaurants (name, description, phone, website, has_menu) VALUES (?, ?, ?, ?, ?)')
    .run(v.name, v.description, v.phone, v.website, hasMenu);
  const row = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ restaurant: mapRestaurant(row) });
});

restaurantsRouter.put('/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ message: 'Restaurant nicht gefunden.' });
  const v = validateRestaurantInput(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  const isActive = req.body?.isActive === undefined ? row.is_active : req.body.isActive ? 1 : 0;
  const hasMenu = req.body?.hasMenu === undefined ? row.has_menu : req.body.hasMenu ? 1 : 0;
  db.prepare(
    'UPDATE restaurants SET name = ?, description = ?, phone = ?, website = ?, is_active = ?, has_menu = ? WHERE id = ?'
  ).run(v.name, v.description, v.phone, v.website, isActive, hasMenu, row.id);
  res.json({
    restaurant: mapRestaurant(db.prepare('SELECT * FROM restaurants WHERE id = ?').get(row.id)),
  });
});

// Löscht ein Restaurant nur, wenn es nirgends verwendet wird –
// andernfalls wird es deaktiviert, damit die Historie erhalten bleibt.
restaurantsRouter.delete('/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ message: 'Restaurant nicht gefunden.' });
  const used = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM day_restaurants WHERE restaurant_id = @id)
       + (SELECT COUNT(*) FROM restaurant_votes WHERE restaurant_id = @id)
       + (SELECT COUNT(*) FROM days WHERE winning_restaurant_id = @id)
       + (SELECT COUNT(*) FROM orders o JOIN menu_items mi ON mi.id = o.menu_item_id
          WHERE mi.restaurant_id = @id) AS n`
    )
    .get({ id: row.id }).n;
  if (used > 0) {
    db.prepare('UPDATE restaurants SET is_active = 0 WHERE id = ?').run(row.id);
    return res.json({
      deactivated: true,
      message: 'Das Restaurant wird bereits verwendet und wurde stattdessen deaktiviert.',
    });
  }
  db.prepare('DELETE FROM restaurants WHERE id = ?').run(row.id);
  res.json({ deleted: true });
});

function validateItemInput(body) {
  const name = String(body?.name || '').trim().slice(0, 120);
  if (!name) return { error: 'Bitte einen Gericht-Namen angeben.' };
  let priceCents = body?.priceCents;
  if (priceCents === '' || priceCents === undefined) priceCents = null;
  if (priceCents !== null && (!Number.isInteger(priceCents) || priceCents < 0)) {
    return { error: 'Ungültiger Preis.' };
  }
  return {
    name,
    description: String(body?.description || '').trim().slice(0, 300),
    category: String(body?.category || '').trim().slice(0, 60),
    allergens: String(body?.allergens || '').trim().slice(0, 120),
    priceCents,
  };
}

// Importierte Gerichte speichern (CSV- und URL-Import teilen sich diese Logik).
// mode 'append': vorhandene Gerichte bleiben, gleichnamige werden aktualisiert.
// mode 'replace': nicht (mehr) enthaltene Gerichte werden entfernt bzw. – wenn
// bereits bestellt – deaktiviert, damit die Historie erhalten bleibt.
const saveImportedItems = db.transaction((restaurantId, items, mode) => {
  const stats = { created: 0, updated: 0, removed: 0, deactivated: 0 };
  const existing = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId);
  const byLowerName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));
  const importedNames = new Set();

  const insert = db.prepare(
    `INSERT INTO menu_items (restaurant_id, name, description, price_cents, category, allergens)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE menu_items SET name = ?, description = ?, price_cents = ?, category = ?, allergens = ?, is_active = 1
     WHERE id = ?`
  );

  for (const it of items) {
    const lower = it.name.toLowerCase();
    importedNames.add(lower);
    const found = byLowerName.get(lower);
    if (found) {
      update.run(it.name, it.description, it.priceCents, it.category, it.allergens, found.id);
      stats.updated += 1;
    } else {
      const info = insert.run(restaurantId, it.name, it.description, it.priceCents, it.category, it.allergens);
      stats.created += 1;
      // Neu angelegte Namen merken, damit Duplikate im selben Import
      // aktualisieren statt an der UNIQUE-Bedingung zu scheitern.
      byLowerName.set(lower, { id: info.lastInsertRowid, name: it.name });
    }
  }

  if (mode === 'replace') {
    const countOrders = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE menu_item_id = ?');
    for (const e of existing) {
      if (importedNames.has(e.name.toLowerCase())) continue;
      if (countOrders.get(e.id).n > 0) {
        db.prepare('UPDATE menu_items SET is_active = 0 WHERE id = ?').run(e.id);
        stats.deactivated += 1;
      } else {
        db.prepare('DELETE FROM menu_items WHERE id = ?').run(e.id);
        stats.removed += 1;
      }
    }
  }
  return stats;
});

export { saveImportedItems };

restaurantsRouter.post('/:id/menu', requireAdmin, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ message: 'Restaurant nicht gefunden.' });
  const v = validateItemInput(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  try {
    const info = db
      .prepare(
        `INSERT INTO menu_items (restaurant_id, name, description, price_cents, category, allergens)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(restaurant.id, v.name, v.description, v.priceCents, v.category, v.allergens);
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ item: mapItem(item) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'Dieses Gericht existiert bereits für das Restaurant.' });
    }
    throw e;
  }
});

// CSV-Import einer Speisekarte. Fehlerhafte Zeilen werden übersprungen und
// mit Zeilennummer zurückgemeldet – gültige Zeilen werden importiert.
restaurantsRouter.post('/:id/menu/import-csv', requireAdmin, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ message: 'Restaurant nicht gefunden.' });

  const csv = String(req.body?.csv || '');
  if (!csv.trim()) return res.status(400).json({ message: 'Keine CSV-Daten übermittelt.' });
  if (csv.length > 512 * 1024) return res.status(413).json({ message: 'Die Datei ist zu groß (max. 512 KB).' });
  const mode = req.body?.mode === 'replace' ? 'replace' : 'append';

  const parsed = parseMenuCsv(csv);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  if (parsed.items.length === 0) {
    return res.status(400).json({ message: 'Keine gültigen Zeilen gefunden.', errors: parsed.errors });
  }

  const stats = saveImportedItems(restaurant.id, parsed.items, mode);
  res.json({ ...stats, importedTotal: parsed.items.length, errors: parsed.errors, mode });
});

// Geprüfte/korrigierte Gerichte aus der Import-Vorschau übernehmen
// (siehe POST /api/menu-import/preview).
restaurantsRouter.post('/:id/menu/import-items', requireAdmin, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ message: 'Restaurant nicht gefunden.' });

  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (rawItems.length === 0) return res.status(400).json({ message: 'Keine Gerichte übermittelt.' });
  if (rawItems.length > 500) return res.status(400).json({ message: 'Zu viele Gerichte (max. 500).' });
  const mode = req.body?.mode === 'replace' ? 'replace' : 'append';

  const items = [];
  const seen = new Set();
  let skipped = 0;
  for (const raw of rawItems) {
    const v = validateItemInput(raw);
    if (v.error || seen.has(v.name?.toLowerCase())) {
      skipped += 1;
      continue;
    }
    seen.add(v.name.toLowerCase());
    items.push(v);
  }
  if (items.length === 0) {
    return res.status(400).json({ message: 'Keine gültigen Gerichte übermittelt.' });
  }

  const stats = saveImportedItems(restaurant.id, items, mode);
  res.json({ ...stats, importedTotal: items.length, skipped, mode });
});

export const menuItemsRouter = Router();
menuItemsRouter.use(requireAuth, requireAdmin);

menuItemsRouter.put('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ message: 'Gericht nicht gefunden.' });
  const v = validateItemInput(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  const isActive = req.body?.isActive === undefined ? item.is_active : req.body.isActive ? 1 : 0;
  try {
    db.prepare(
      `UPDATE menu_items SET name = ?, description = ?, price_cents = ?, category = ?, allergens = ?, is_active = ?
       WHERE id = ?`
    ).run(v.name, v.description, v.priceCents, v.category, v.allergens, isActive, item.id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'Dieses Gericht existiert bereits für das Restaurant.' });
    }
    throw e;
  }
  res.json({ item: mapItem(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.id)) });
});

menuItemsRouter.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ message: 'Gericht nicht gefunden.' });
  const used = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE menu_item_id = ?').get(item.id).n;
  if (used > 0) {
    db.prepare('UPDATE menu_items SET is_active = 0 WHERE id = ?').run(item.id);
    return res.json({
      deactivated: true,
      message: 'Das Gericht wurde bereits bestellt und wurde stattdessen deaktiviert.',
    });
  }
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(item.id);
  res.json({ deleted: true });
});
