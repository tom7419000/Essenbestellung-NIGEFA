import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

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
       ORDER BY name COLLATE NOCASE`
    )
    .all(restaurant.id);
  res.json({ restaurant: mapRestaurant(restaurant), items: items.map(mapItem) });
});

function validateRestaurantInput(body) {
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Bitte einen Namen angeben.' };
  return {
    name,
    description: String(body?.description || '').trim(),
    phone: String(body?.phone || '').trim(),
    website: String(body?.website || '').trim(),
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
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Bitte einen Gericht-Namen angeben.' };
  let priceCents = body?.priceCents;
  if (priceCents === '' || priceCents === undefined) priceCents = null;
  if (priceCents !== null && (!Number.isInteger(priceCents) || priceCents < 0)) {
    return { error: 'Ungültiger Preis.' };
  }
  return { name, description: String(body?.description || '').trim(), priceCents };
}

restaurantsRouter.post('/:id/menu', requireAdmin, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ message: 'Restaurant nicht gefunden.' });
  const v = validateItemInput(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  try {
    const info = db
      .prepare(
        'INSERT INTO menu_items (restaurant_id, name, description, price_cents) VALUES (?, ?, ?, ?)'
      )
      .run(restaurant.id, v.name, v.description, v.priceCents);
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ item: mapItem(item) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'Dieses Gericht existiert bereits für das Restaurant.' });
    }
    throw e;
  }
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
      'UPDATE menu_items SET name = ?, description = ?, price_cents = ?, is_active = ? WHERE id = ?'
    ).run(v.name, v.description, v.priceCents, isActive, item.id);
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
