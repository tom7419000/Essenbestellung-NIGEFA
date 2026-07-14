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
