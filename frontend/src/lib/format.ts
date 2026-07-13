import type { Locale } from './types';

const intlLocale = (locale: Locale) => (locale === 'de' ? 'de-DE' : 'en-GB');

/** Euro-Betrag, z. B. 8,50 € / €8.50 */
export function formatCurrency(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

/** Parst "YYYY-MM-DD" als lokales Datum (ohne Zeitzonen-Verschiebung). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateOnly(value) : new Date(value);
}

/** Kurzes Datum, z. B. 13.07.2026 / 13/07/2026 */
export function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(value));
}

/** Langes Datum mit Wochentag, z. B. Montag, 13. Juli 2026 */
export function formatDateLong(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toDate(value));
}

/** Uhrzeit, z. B. 11:30 */
export function formatTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** Datum + Uhrzeit, z. B. 13.07.2026, 11:30 */
export function formatDateTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** Relative Zeit für Benachrichtigungen, z. B. „vor 5 Minuten“. */
export function relativeTime(value: string, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const diffMs = new Date(value).getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.trunc(diffSec / 10) * 10 === 0 ? 0 : diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.trunc(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.trunc(diffSec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.trunc(diffSec / 86400), 'day');
  return formatDate(value, locale);
}

/** Lokales Kalenderdatum als "YYYY-MM-DD" (für date-Inputs & API-Parameter). */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "HH:mm" aus einem ISO-Zeitstempel (lokale Zeit), für time-Inputs. */
export function toTimeInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Datum um n Tage verschieben (lokales Kalenderdatum). */
export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
