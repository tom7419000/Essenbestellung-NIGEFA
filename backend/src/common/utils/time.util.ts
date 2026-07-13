import { DateTime } from 'luxon';

/** Normalisiert 'HH:mm' / 'HH:mm:ss' auf 'HH:mm'. */
export function toHHmm(time: string): string {
  return time.slice(0, 5);
}

/**
 * Kombiniert Kalendertag + Uhrzeit in einer Zeitzone zu einem UTC-Zeitpunkt.
 * combineDateAndTime('2026-07-13', '10:00', 'Europe/Berlin') → 2026-07-13T08:00:00Z
 */
export function combineDateAndTime(date: string, time: string, timezone: string): Date {
  const dt = DateTime.fromISO(`${date}T${toHHmm(time)}`, { zone: timezone });
  if (!dt.isValid) {
    throw new Error(`Ungültige Datum/Zeit-Kombination: ${date} ${time} (${timezone})`);
  }
  return dt.toUTC().toJSDate();
}

/** Heutiges Datum ('YYYY-MM-DD') in der angegebenen Zeitzone. */
export function todayInZone(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate() as string;
}

/** Wochentag (0 = Sonntag … 6 = Samstag) eines 'YYYY-MM-DD'-Datums. */
export function weekdayOf(date: string): number {
  const iso = DateTime.fromISO(date).weekday; // 1 = Montag … 7 = Sonntag
  return iso % 7;
}

/** Datum n Tage vor/nach einem 'YYYY-MM-DD'-Datum. */
export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date).plus({ days }).toISODate() as string;
}

/** Formatiert einen Zeitpunkt als Uhrzeit in einer Zeitzone (z. B. '11:30'). */
export function formatTimeInZone(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant).setZone(timezone).toFormat('HH:mm');
}

/** Formatiert einen Kalendertag lokalisiert (z. B. '13.07.2026' / '2026-07-13'). */
export function formatDateForLocale(date: string, locale: string): string {
  return DateTime.fromISO(date)
    .setLocale(locale === 'en' ? 'en-GB' : 'de-DE')
    .toLocaleString(DateTime.DATE_SHORT);
}
