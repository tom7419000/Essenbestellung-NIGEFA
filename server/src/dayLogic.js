import { db } from './db.js';

// Gewinner der Phase 1: meiste Stimmen; bei Gleichstand gewinnt die
// zuerst gelistete Option des Tages. Ohne Stimmen fällt die Wahl auf
// die erste Option, damit Phase 2 immer stattfinden kann.
export function tallyWinner(dayId) {
  const rows = db
    .prepare(
      `SELECT dr.restaurant_id AS restaurantId, COUNT(v.id) AS votes
       FROM day_restaurants dr
       LEFT JOIN restaurant_votes v
         ON v.day_id = dr.day_id AND v.restaurant_id = dr.restaurant_id
       WHERE dr.day_id = ?
       GROUP BY dr.restaurant_id
       ORDER BY votes DESC, dr.position ASC, dr.id ASC`
    )
    .all(dayId);
  return rows.length ? rows[0].restaurantId : null;
}

// Leitet den Status eines Tages aus den Deadlines ab und persistiert
// Änderungen. Der Gewinner wird beim Übergang zu Phase 2 eingefroren
// und nur neu berechnet, wenn ein Admin die Deadlines zurücksetzt.
export function ensureCurrent(day) {
  if (!day) return day;
  const now = Date.now();
  const p1 = Date.parse(day.phase1_deadline);
  const p2 = Date.parse(day.phase2_deadline);

  let status;
  let winner = day.winning_restaurant_id;
  if (now < p1) {
    status = 'phase1';
    winner = null;
  } else {
    if (winner == null) winner = tallyWinner(day.id);
    status = now < p2 ? 'phase2' : 'closed';
  }

  if (status !== day.status || winner !== day.winning_restaurant_id) {
    db.prepare('UPDATE days SET status = ?, winning_restaurant_id = ? WHERE id = ?').run(
      status,
      winner,
      day.id
    );
    return db.prepare('SELECT * FROM days WHERE id = ?').get(day.id);
  }
  return day;
}

// Wird periodisch und vor Listen-Abfragen aufgerufen, damit Phasenwechsel
// auch ohne Benutzer-Traffic stattfinden.
export function resolveOpenDays() {
  const open = db.prepare("SELECT * FROM days WHERE status != 'closed'").all();
  for (const day of open) ensureCurrent(day);
}
