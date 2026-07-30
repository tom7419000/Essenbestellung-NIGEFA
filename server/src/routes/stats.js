import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

// Jahresrückblick („Wrapped"): persönliche und portalweite Auswertung der
// bestehenden Bestellhistorie – ohne zusätzliche Datenhaltung.
//
// Zeitraum: days.date liegt als ISO-Text 'JJJJ-MM-TT' vor. Damit genügt ein
// einfacher Bereichsvergleich auf der Zeichenkette ('2026-01-01' … '2026-12-31'),
// der lexikografisch exakt dem Datumsvergleich entspricht. Das ist die
// einfachste saubere Lösung – kein Parsen, keine Zeitzonenfragen, und es nutzt
// den vorhandenen Index auf days.date.

const router = Router();
router.use(requireAuth);

const ALL = { value: 'gesamt', label: 'Seit Beginn', from: '0000-01-01', to: '9999-12-31' };

function periodsWithData() {
  const years = db
    .prepare(
      `SELECT DISTINCT substr(d.date, 1, 4) AS year
       FROM days d
       JOIN orders o ON o.day_id = d.id
       WHERE o.status != 'storniert'
       ORDER BY year DESC`
    )
    .all()
    .map((r) => r.year);
  return [
    ...years.map((y) => ({ value: y, label: y, from: `${y}-01-01`, to: `${y}-12-31` })),
    ALL,
  ];
}

function resolvePeriod(requested, available) {
  if (requested) {
    const hit = available.find((p) => p.value === String(requested));
    if (hit) return hit;
  }
  // Vorbelegung: das laufende Jahr, wenn es Bestellungen hat, sonst das
  // jüngste Jahr mit Daten, sonst „Seit Beginn".
  const currentYear = String(new Date().getFullYear());
  return available.find((p) => p.value === currentYear) || available[0] || ALL;
}

// Häufigstes Gericht. Gelöschte Gerichte (menu_item_id = NULL) fallen aus der
// Auswertung – sie haben keinen Namen mehr, den man anzeigen könnte.
function topItem({ from, to, userId }) {
  return (
    db
      .prepare(
        `SELECT mi.name AS name, mi.category AS category, COUNT(*) AS count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN days d ON d.id = o.day_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.status != 'storniert' AND d.date BETWEEN ? AND ?
           AND (? IS NULL OR o.user_id = ?)
         GROUP BY mi.id
         ORDER BY count DESC, mi.name COLLATE NOCASE
         LIMIT 1`
      )
      .get(from, to, userId ?? null, userId ?? null) || null
  );
}

// Häufigstes Restaurant: gezählt werden die eigenen Bestellungen an Tagen,
// an denen das jeweilige Restaurant gewonnen hat.
function topRestaurant({ from, to, userId }) {
  return (
    db
      .prepare(
        `SELECT r.name AS name, COUNT(*) AS count
         FROM orders o
         JOIN days d ON d.id = o.day_id
         JOIN restaurants r ON r.id = d.winning_restaurant_id
         WHERE o.status != 'storniert' AND d.date BETWEEN ? AND ?
           AND (? IS NULL OR o.user_id = ?)
         GROUP BY r.id
         ORDER BY count DESC, r.name COLLATE NOCASE
         LIMIT 1`
      )
      .get(from, to, userId ?? null, userId ?? null) || null
  );
}

function totals({ from, to, userId }) {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT o.id) AS orderCount,
              COUNT(DISTINCT o.user_id) AS participants,
              COUNT(DISTINCT d.id) AS dayCount
       FROM orders o
       JOIN days d ON d.id = o.day_id
       WHERE o.status != 'storniert' AND d.date BETWEEN ? AND ?
         AND (? IS NULL OR o.user_id = ?)`
    )
    .get(from, to, userId ?? null, userId ?? null);
  const items = db
    .prepare(
      `SELECT COUNT(*) AS itemCount,
              COUNT(DISTINCT oi.menu_item_id) AS distinctItems,
              COALESCE(SUM(mi.price_cents), 0) AS totalCents
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN days d ON d.id = o.day_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.status != 'storniert' AND d.date BETWEEN ? AND ?
         AND (? IS NULL OR o.user_id = ?)`
    )
    .get(from, to, userId ?? null, userId ?? null);
  return { ...row, ...items };
}

// Tag mit den meisten Bestellungen (nur portalweit interessant).
function busiestDay({ from, to }) {
  return (
    db
      .prepare(
        `SELECT d.date AS date, COUNT(*) AS count
         FROM orders o
         JOIN days d ON d.id = o.day_id
         WHERE o.status != 'storniert' AND d.date BETWEEN ? AND ?
         GROUP BY d.id
         ORDER BY count DESC, d.date DESC
         LIMIT 1`
      )
      .get(from, to) || null
  );
}

router.get('/wrapped', (req, res) => {
  const available = periodsWithData();
  const period = resolvePeriod(req.query.zeitraum, available);
  const scope = { from: period.from, to: period.to };
  const mine = { ...scope, userId: req.user.id };

  res.json({
    period,
    availablePeriods: available,
    personal: {
      ...totals(mine),
      topItem: topItem(mine),
      topRestaurant: topRestaurant(mine),
    },
    global: {
      ...totals(scope),
      topItem: topItem(scope),
      topRestaurant: topRestaurant(scope),
      busiestDay: busiestDay(scope),
    },
  });
});

export default router;
