// Wochentags-Erkennung und -Normalisierung für „Tagesessen".
// Wochentage werden intern als ISO-Nummern geführt: 1 = Montag … 7 = Sonntag.
// Die verbindliche Steuerung erfolgt über das explizite Feld menu_items.weekdays
// (CSV der ISO-Nummern, leer = jeden Tag). Die Erkennung aus Freitext dient nur
// als Vorbelegung/Vorschlag, den ein Mensch bestätigen oder korrigieren kann.

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_SHORT = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 7: 'So' };
export const WEEKDAY_LONG = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
};

const FULL = {
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  sonnabend: 6,
  sonntag: 7,
};
const SHORT = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7 };

// Ein Token (Vollname mit optionaler Endung -s/-en oder Zweibuchstaben-Kürzel)
// auf eine ISO-Nummer abbilden.
function tokenToIso(tok) {
  const t = tok.toLowerCase();
  for (const name of Object.keys(FULL)) {
    if (t === name || t === `${name}s` || t === `${name}en`) return FULL[name];
  }
  if (SHORT[t] != null) return SHORT[t];
  return null;
}

const TOKEN = '(?:montags?|montagen|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonnabends?|sonntags?|mo|di|mi|do|fr|sa|so)';
const RANGE_RE = new RegExp(`(${TOKEN})\\s*(?:-|–|—|bis)\\s*(${TOKEN})`, 'gi');
const SINGLE_RE = new RegExp(`\\b${TOKEN}\\b`, 'gi');

// Erkennt Wochentage in Freitext (Vollnamen, Kürzel, Bereiche „Mo–Fr",
// „Montag bis Freitag", Aufzählungen „Mo, Mi"). Rückgabe: normalisierte CSV
// der ISO-Nummern (z. B. "1,3") oder '' wenn nichts erkannt wurde.
export function detectWeekdays(text) {
  const s = String(text || '');
  if (!s.trim()) return '';
  const found = new Set();

  // Bereiche zuerst und den Treffer aus dem Text entfernen, damit die
  // Einzel-Erkennung die Bereichsenden nicht doppelt auswertet.
  const rest = s.replace(RANGE_RE, (m, a, b) => {
    const from = tokenToIso(a);
    const to = tokenToIso(b);
    if (from != null && to != null) {
      if (from <= to) for (let d = from; d <= to; d += 1) found.add(d);
      else {
        found.add(from);
        found.add(to);
      }
    }
    return ' ';
  });

  const singles = rest.match(SINGLE_RE) || [];
  for (const tok of singles) {
    const iso = tokenToIso(tok);
    if (iso != null) found.add(iso);
  }

  return [...found].sort((x, y) => x - y).join(',');
}

// Normalisiert eine Eingabe des expliziten Feldes: akzeptiert ein Array von
// Zahlen/Strings oder eine CSV. Enthält der String Buchstaben, wird auf die
// Freitext-Erkennung zurückgegriffen. Rückgabe: bereinigte, sortierte CSV.
export function normalizeWeekdays(value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) {
    const set = new Set(
      value.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    );
    return [...set].sort((a, b) => a - b).join(',');
  }
  const str = String(value);
  if (/[a-zä]/i.test(str)) return detectWeekdays(str);
  const set = new Set(
    str
      .split(/[^\d]+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
  );
  return [...set].sort((a, b) => a - b).join(',');
}

// CSV -> Array von ISO-Nummern (für die API/Anzeige).
export function parseWeekdayCsv(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

// Ist ein Gericht mit gegebener weekdays-CSV am ISO-Wochentag verfügbar?
// Leere CSV = uneingeschränkt (jeden Tag).
export function weekdaysAllow(csv, weekday) {
  if (!csv) return true;
  return parseWeekdayCsv(csv).includes(weekday);
}
