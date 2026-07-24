export function fmtPrice(cents) {
  if (cents == null) return '–';
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function fmtDateLong(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fmtDateShort(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export const ORDER_STATUS = [
  { value: 'eingegangen', label: 'Eingegangen' },
  { value: 'bestellt', label: 'Bestellt' },
  { value: 'geliefert', label: 'Geliefert' },
  { value: 'storniert', label: 'Storniert' },
];

export function statusLabel(value) {
  return ORDER_STATUS.find((s) => s.value === value)?.label || value;
}

export const DAY_STATUS = {
  phase1: 'Phase 1 · Restaurantwahl',
  phase2: 'Phase 2 · Essensauswahl',
  closed: 'Abgeschlossen',
};

export const ORGANIZER_MODES = [
  { value: 'manuell', label: 'Manuell (Admin legt fest)' },
  { value: 'freiwillig', label: 'Freiwillige Meldung (mit Zufalls-Fallback)' },
  { value: 'zufaellig', label: 'Zufällig aus den Mitbestellern' },
];

export function organizerModeLabel(value) {
  return ORGANIZER_MODES.find((m) => m.value === value)?.label || value;
}

export const ORGANIZER_SOURCE_LABELS = {
  manuell: 'zugewiesen',
  freiwillig: 'freiwillig gemeldet',
  zufaellig: 'zufällig ausgewählt',
};

// Nur http(s)-URLs als Link zulassen (Schutz vor javascript:/data:-Links).
export function safeHttpUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(String(raw));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parsePriceInput(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const value = Number.parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return undefined; // ungültig
  return Math.round(value * 100);
}

export function priceInputValue(cents) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ISO-Zeitstempel -> Wert für <input type="time"> in lokaler Zeit
export function timeInputValue(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- Wochentage (Tagesessen) ----------
// ISO-Nummern: 1 = Montag … 7 = Sonntag.

export const WEEKDAYS_ALL = [
  { n: 1, short: 'Mo', long: 'Montag' },
  { n: 2, short: 'Di', long: 'Dienstag' },
  { n: 3, short: 'Mi', long: 'Mittwoch' },
  { n: 4, short: 'Do', long: 'Donnerstag' },
  { n: 5, short: 'Fr', long: 'Freitag' },
  { n: 6, short: 'Sa', long: 'Samstag' },
  { n: 7, short: 'So', long: 'Sonntag' },
];

// Array von ISO-Nummern -> "Mo, Mi" (leer = an allen Tagen).
export function formatWeekdays(weekdays, empty = 'jeden Tag') {
  if (!weekdays || weekdays.length === 0) return empty;
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((n) => WEEKDAYS_ALL.find((w) => w.n === n)?.short || n)
    .join(', ');
}

// Client-seitige Wochentags-Erkennung (Vorschlag). Der Server bleibt die
// verbindliche Quelle; dies dient nur der „aus Beschreibung"-Schaltfläche.
const WD_FULL = {
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  sonnabend: 6,
  sonntag: 7,
};
const WD_SHORT = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7 };
const WD_TOKEN =
  '(?:montags?|montagen|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonnabends?|sonntags?|mo|di|mi|do|fr|sa|so)';

function wdTokenToIso(tok) {
  const t = tok.toLowerCase();
  for (const name of Object.keys(WD_FULL)) {
    if (t === name || t === `${name}s` || t === `${name}en`) return WD_FULL[name];
  }
  return WD_SHORT[t] ?? null;
}

export function detectWeekdaysFromText(text) {
  const s = String(text || '');
  if (!s.trim()) return [];
  const found = new Set();
  const rangeRe = new RegExp(`(${WD_TOKEN})\\s*(?:-|–|—|bis)\\s*(${WD_TOKEN})`, 'gi');
  const rest = s.replace(rangeRe, (m, a, b) => {
    const from = wdTokenToIso(a);
    const to = wdTokenToIso(b);
    if (from != null && to != null) {
      if (from <= to) for (let d = from; d <= to; d += 1) found.add(d);
      else {
        found.add(from);
        found.add(to);
      }
    }
    return ' ';
  });
  const singles = rest.match(new RegExp(`\\b${WD_TOKEN}\\b`, 'gi')) || [];
  for (const tok of singles) {
    const iso = wdTokenToIso(tok);
    if (iso != null) found.add(iso);
  }
  return [...found].sort((a, b) => a - b);
}
