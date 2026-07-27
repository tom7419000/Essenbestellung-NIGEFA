import { db, getSetting, setSetting } from './db.js';
import { zonedIso, todayStr, isoWeekday, TZ } from './util.js';

// Automatische Tagesplanung (Mo–Fr): Konfiguration liegt als JSON in den
// Einstellungen (Schlüssel auto_plan_config). Wochenenden werden generell
// ausgelassen; Feiertage/Ausnahmen pflegt der Planer als Datumsliste, da
// keine Feiertagsbibliothek eingebunden ist.

const SETTING_KEY = 'auto_plan_config';
const WEEKDAYS = [1, 2, 3, 4, 5]; // 1 = Montag … 5 = Freitag (ISO)
const MODES = ['fest', 'rotierend'];
const ORGANIZER_MODES = ['manuell', 'freiwillig', 'zufaellig'];

export const WEEKDAY_LABELS = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
};

function defaultConfig() {
  const weekdays = {};
  for (const wd of WEEKDAYS) weekdays[wd] = { mode: 'fest', restaurantIds: [] };
  return {
    enabled: false,
    daysAhead: 14,
    organizerMode: 'manuell',
    phase1Time: getSetting('default_phase1_time', '10:30'),
    phase2Time: getSetting('default_phase2_time', '11:45'),
    weekdays,
    holidays: [],
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function epochDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

// Fortlaufender, deterministischer Rotationsindex je Wochentag: aufeinander
// folgende Vorkommen desselben Wochentags liegen 7 Tage auseinander, daher
// erhöht sich floor(epochDay/7) zwischen ihnen um genau 1.
export function rotationIndex(dateStr, length) {
  if (length <= 0) return 0;
  return Math.floor(epochDay(dateStr) / 7) % length;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d + n))
  );
}

// Normalisiert und validiert eine eingehende Konfiguration. Liefert
// { config } oder { error }.
export function validateAutoPlanConfig(input) {
  const cfg = defaultConfig();
  if (input == null || typeof input !== 'object') return { error: 'Ungültige Konfiguration.' };

  cfg.enabled = !!input.enabled;

  const daysAhead = Number(input.daysAhead);
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 60) {
    return { error: 'Vorlauf: bitte 1–60 Tage angeben.' };
  }
  cfg.daysAhead = daysAhead;

  if (!ORGANIZER_MODES.includes(input.organizerMode)) {
    return { error: 'Ungültiger Organisator-Modus.' };
  }
  cfg.organizerMode = input.organizerMode;

  if (!TIME_RE.test(String(input.phase1Time)) || !TIME_RE.test(String(input.phase2Time))) {
    return { error: 'Bitte gültige Uhrzeiten im Format HH:MM angeben.' };
  }
  if (String(input.phase1Time) >= String(input.phase2Time)) {
    return { error: 'Der Bestellschluss muss nach dem Ende der Restaurantwahl liegen.' };
  }
  cfg.phase1Time = input.phase1Time;
  cfg.phase2Time = input.phase2Time;

  // Bekannte, aktive Restaurants zum Filtern unbekannter IDs.
  const known = new Set(
    db.prepare('SELECT id FROM restaurants WHERE is_active = 1').all().map((r) => r.id)
  );
  const inWeekdays = input.weekdays || {};
  for (const wd of WEEKDAYS) {
    const raw = inWeekdays[wd] || inWeekdays[String(wd)] || {};
    const mode = MODES.includes(raw.mode) ? raw.mode : 'fest';
    const ids = [...new Set((Array.isArray(raw.restaurantIds) ? raw.restaurantIds : []).map(Number))]
      .filter((id) => Number.isInteger(id) && known.has(id));
    cfg.weekdays[wd] = { mode, restaurantIds: ids };
  }

  const holidays = Array.isArray(input.holidays) ? input.holidays : [];
  const clean = [...new Set(holidays.map((s) => String(s).trim()))].filter((s) => DATE_RE.test(s));
  if (clean.length !== holidays.filter((s) => String(s).trim() !== '').length) {
    return { error: 'Feiertage: bitte Datumsangaben im Format JJJJ-MM-TT (eine je Zeile).' };
  }
  clean.sort();
  cfg.holidays = clean;

  return { config: cfg };
}

export function getAutoPlanConfig() {
  const raw = getSetting(SETTING_KEY, null);
  if (!raw) return defaultConfig();
  try {
    const parsed = JSON.parse(raw);
    // Über validate laufen lassen, damit stets ein vollständiges, gültiges
    // Objekt zurückkommt (auch nach Schemaerweiterungen).
    const { config } = validateAutoPlanConfig(parsed);
    return config || defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export function setAutoPlanConfig(input) {
  const { config, error } = validateAutoPlanConfig(input);
  if (error) return { error };
  setSetting(SETTING_KEY, JSON.stringify(config));
  return { config };
}

const insertAutoDayTx = db.transaction((day) => {
  const info = db
    .prepare(
      `INSERT INTO days
         (date, organizer_id, organizer_mode, organizer_source,
          phase1_deadline, phase2_deadline, auto_created)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .run(day.date, null, day.organizerMode, null, day.p1Iso, day.p2Iso);
  const dayId = info.lastInsertRowid;
  const insert = db.prepare(
    'INSERT INTO day_restaurants (day_id, restaurant_id, position) VALUES (?, ?, ?)'
  );
  day.restaurantIds.forEach((rid, i) => insert.run(dayId, rid, i));
  return dayId;
});

// Erzeugt fehlende Tage gemäß Konfiguration. Bestehende Tage werden NIE
// überschrieben (manuelle Änderungen bleiben erhalten). Startet ab morgen,
// um keine bereits angebrochenen „Heute"-Tage mit Vergangenheits-Deadlines
// anzulegen. Gibt eine Zusammenfassung zurück.
export function generateAutoPlan({ today = todayStr(), tz = TZ } = {}) {
  const cfg = getAutoPlanConfig();
  const result = { enabled: cfg.enabled, created: [], skipped: [] };
  if (!cfg.enabled) return result;

  const holidays = new Set(cfg.holidays);
  const existing = new Set(db.prepare('SELECT date FROM days').all().map((r) => r.date));
  const removed = new Set(db.prepare('SELECT date FROM auto_plan_removed').all().map((r) => r.date));
  const activeIds = new Set(
    db.prepare('SELECT id FROM restaurants WHERE is_active = 1').all().map((r) => r.id)
  );

  for (let offset = 1; offset <= cfg.daysAhead; offset += 1) {
    const date = addDays(today, offset);
    const wd = isoWeekday(date);
    if (wd > 5) continue; // Wochenende
    if (holidays.has(date)) {
      result.skipped.push({ date, reason: 'Feiertag' });
      continue;
    }
    // Vom Planer gelöschte Daten nicht wieder anlegen (Problem A).
    if (removed.has(date)) {
      result.skipped.push({ date, reason: 'gelöscht' });
      continue;
    }
    if (existing.has(date)) continue; // bereits geplant – unangetastet lassen

    const wdCfg = cfg.weekdays[wd] || { mode: 'fest', restaurantIds: [] };
    const validIds = wdCfg.restaurantIds.filter((id) => activeIds.has(id));
    if (validIds.length === 0) {
      result.skipped.push({ date, reason: 'kein Restaurant konfiguriert' });
      continue;
    }

    const restaurantIds =
      wdCfg.mode === 'rotierend'
        ? [validIds[rotationIndex(date, validIds.length)]]
        : validIds;

    insertAutoDayTx({
      date,
      organizerMode: cfg.organizerMode,
      p1Iso: zonedIso(date, cfg.phase1Time, tz),
      p2Iso: zonedIso(date, cfg.phase2Time, tz),
      restaurantIds,
    });
    existing.add(date);
    result.created.push(date);
  }

  return result;
}

// Ein (künftiges) Datum von der Automatik ausschließen (nach dem Löschen).
export function suppressAutoDate(date) {
  db.prepare('INSERT OR IGNORE INTO auto_plan_removed (date) VALUES (?)').run(date);
}

// Sperre aufheben (z. B. wenn der Tag manuell wieder angelegt wird).
export function unsuppressAutoDate(date) {
  db.prepare('DELETE FROM auto_plan_removed WHERE date = ?').run(date);
}

// Neuerzeugung nach Änderung der Einstellungen (Problem B): sicher ersetzbare
// Zukunfts-Auto-Tage entfernen und gemäß aktueller Konfiguration neu anlegen.
// „Sicher ersetzbar" = auto_created = 1, date > heute, keine Bestellungen und
// keine Stimmen. Geschützte Tage (manuell bearbeitet, mit Bestellungen/Stimmen,
// heute/vergangen) sowie gesperrte Daten bleiben unangetastet.
export function regenerateAutoPlan({ today = todayStr(), tz = TZ } = {}) {
  const cfg = getAutoPlanConfig();
  const result = { enabled: cfg.enabled, removed: [], created: [], kept: [] };
  if (!cfg.enabled) return result;

  // 1) Sicher ersetzbare Zukunfts-Auto-Tage bestimmen und löschen.
  const replaceable = db
    .prepare(
      `SELECT d.id, d.date
         FROM days d
        WHERE d.auto_created = 1
          AND d.date > ?
          AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.day_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM restaurant_votes v WHERE v.day_id = d.id)`
    )
    .all(today);
  const del = db.prepare('DELETE FROM days WHERE id = ?');
  const replaceTx = db.transaction(() => {
    for (const r of replaceable) {
      del.run(r.id);
      result.removed.push(r.date);
    }
    // Ein bewusstes Speichern der Einstellungen = „Plan neu aufbauen": die
    // Sperrliste zuvor gelöschter Tage wird zurückgesetzt, damit der Plan
    // vollständig gemäß aktueller Konfiguration entsteht. (Ein einzelnes
    // Löschen bleibt gegenüber der routinemäßigen Erzeugung wirksam, bis wieder
    // gespeichert wird.)
    db.prepare('DELETE FROM auto_plan_removed').run();
  });
  replaceTx();

  // 2) Gemäß aktueller Konfiguration neu erzeugen (überspringt bestehende/
  //    geschützte Tage, Wochenenden, Feiertage; Sperrliste ist geleert).
  const gen = generateAutoPlan({ today, tz });
  result.created = gen.created;

  // 3) Geschützte Tage im Zeitraum ermitteln (existieren, aber nicht (neu)
  //    erzeugt) – für die UI-Rückmeldung „nicht ersetzt".
  const holidays = new Set(cfg.holidays);
  const removedSet = new Set(
    db.prepare('SELECT date FROM auto_plan_removed').all().map((r) => r.date)
  );
  const createdSet = new Set(gen.created);
  const existsStmt = db.prepare('SELECT 1 FROM days WHERE date = ?');
  for (let offset = 1; offset <= cfg.daysAhead; offset += 1) {
    const date = addDays(today, offset);
    const wd = isoWeekday(date);
    if (wd > 5 || holidays.has(date) || removedSet.has(date)) continue;
    const wdCfg = cfg.weekdays[wd] || { restaurantIds: [] };
    if (!wdCfg.restaurantIds || wdCfg.restaurantIds.length === 0) continue;
    if (createdSet.has(date)) continue; // gerade neu erzeugt
    if (existsStmt.get(date)) result.kept.push(date); // bestehend & geschützt
  }
  return result;
}
