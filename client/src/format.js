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
