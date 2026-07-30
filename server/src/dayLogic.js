import { db, getSetting } from './db.js';
import { notifyOrganizerAssigned, notifyPhaseClosed } from './push.js';

// Gewinner der Phase 1: meiste Stimmen; bei Gleichstand gewinnt die
// zuerst gelistete Option des Tages. Hat KEIN Restaurant auch nur eine
// Stimme, wird bewusst keines bestimmt (null) – sonst gewönne willkürlich
// die erste Option, obwohl niemand abgestimmt hat. Planung/Admin legt in
// diesem Fall manuell fest (PATCH /days/:id/winner).
// Restaurants OHNE Speisekarte (Supermärkte) nehmen NICHT an der Abstimmung
// teil – sie können nie Gewinner werden (dort läuft nur eine Teilnahmeliste).
export function tallyWinner(dayId) {
  const rows = db
    .prepare(
      `SELECT dr.restaurant_id AS restaurantId, COUNT(v.id) AS votes
       FROM day_restaurants dr
       JOIN restaurants r ON r.id = dr.restaurant_id
       LEFT JOIN restaurant_votes v
         ON v.day_id = dr.day_id AND v.restaurant_id = dr.restaurant_id
       WHERE dr.day_id = ? AND r.has_menu = 1
       GROUP BY dr.restaurant_id
       ORDER BY votes DESC, dr.position ASC, dr.id ASC`
    )
    .all(dayId);
  const top = rows[0];
  return top && top.votes > 0 ? top.restaurantId : null;
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
    day = db.prepare('SELECT * FROM days WHERE id = ?').get(day.id);
  }
  const finalDay = maybeAssignOrganizer(day);
  // Beim Übergang in „closed" den Organisator erinnern (Dedup in push.js).
  if (finalDay.status === 'closed') notifyPhaseClosed(finalDay);
  return finalDay;
}

// Automatische Organisator-Zuweisung:
// - Modus "zufaellig": zum konfigurierten Zeitpunkt wird zufällig eine Person
//   aus den Mitbestellern des Tages bestimmt.
// - Modus "freiwillig": gleiche Logik als Fallback – hat sich bis zum
//   Zeitpunkt niemand freiwillig gemeldet, wird zufällig zugewiesen.
// Zeitpunkt: organizer_assign_minutes Minuten vor dem Bestellschluss
// (0 = genau zum Bestellschluss). Läuft auch nach Tagesabschluss nach,
// falls der Server zum Stichzeitpunkt nicht lief.
function maybeAssignOrganizer(day) {
  if (!day || day.organizer_id != null) return day;
  if (day.organizer_mode !== 'freiwillig' && day.organizer_mode !== 'zufaellig') return day;
  if (day.status === 'phase1') return day;

  const minutes = Number(getSetting('organizer_assign_minutes', '0')) || 0;
  if (Date.now() < Date.parse(day.phase2_deadline) - minutes * 60_000) return day;

  const orderers = db
    .prepare("SELECT user_id FROM orders WHERE day_id = ? AND status != 'storniert'")
    .all(day.id);
  if (orderers.length === 0) return day;

  const pick = orderers[Math.floor(Math.random() * orderers.length)].user_id;
  const info = db
    .prepare(
      "UPDATE days SET organizer_id = ?, organizer_source = 'zufaellig' WHERE id = ? AND organizer_id IS NULL"
    )
    .run(pick, day.id);
  const updated = db.prepare('SELECT * FROM days WHERE id = ?').get(day.id);
  // Zufällig bestimmter Organisator: besonders wichtig, dass er es erfährt.
  if (info.changes > 0) notifyOrganizerAssigned(updated, pick);
  return updated;
}

// Wird periodisch und vor Listen-Abfragen aufgerufen, damit Phasenwechsel
// auch ohne Benutzer-Traffic stattfinden.
export function resolveOpenDays() {
  const open = db.prepare("SELECT * FROM days WHERE status != 'closed'").all();
  for (const day of open) ensureCurrent(day);
}
