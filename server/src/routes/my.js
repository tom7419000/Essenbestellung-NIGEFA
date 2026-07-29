import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { resolveOpenDays } from '../dayLogic.js';
import { todayStr } from '../util.js';

const router = Router();
router.use(requireAuth);

router.get('/orders', (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.id, d.date, o.note, o.status, o.paid, o.updated_at AS updatedAt,
              r.name AS restaurantName
       FROM orders o
       JOIN days d ON d.id = o.day_id
       LEFT JOIN restaurants r ON r.id = d.winning_restaurant_id
       WHERE o.user_id = ?
       ORDER BY d.date DESC
       LIMIT 100`
    )
    .all(req.user.id);
  const itemsStmt = db.prepare(
    `SELECT mi.name AS itemName, mi.price_cents AS priceCents, mi.category AS category
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id = ?
     ORDER BY mi.category COLLATE NOCASE, mi.name COLLATE NOCASE`
  );
  const orders = rows.map((o) => {
    const items = itemsStmt.all(o.id);
    const totalCents = items.reduce((s, it) => (it.priceCents != null ? s + it.priceCents : s), 0);
    return { ...o, paid: !!o.paid, items, totalCents };
  });
  res.json({ orders });
});

// Tage, für die der angemeldete Benutzer Organisator ist.
router.get('/organizer-days', (req, res) => {
  resolveOpenDays();
  const rows = db
    .prepare(
      `SELECT d.id, d.date, d.status, r.name AS winnerName,
         (SELECT COUNT(*) FROM orders o WHERE o.day_id = d.id AND o.status != 'storniert') AS orderCount
       FROM days d
       LEFT JOIN restaurants r ON r.id = d.winning_restaurant_id
       WHERE d.organizer_id = ?
       ORDER BY d.date DESC
       LIMIT 30`
    )
    .all(req.user.id);
  res.json({ days: rows, today: todayStr() });
});

export default router;
