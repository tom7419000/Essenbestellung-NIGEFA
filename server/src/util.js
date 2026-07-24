export const TZ = process.env.APP_TIMEZONE || 'Europe/Berlin';

// Heutiges Datum (YYYY-MM-DD) in der App-Zeitzone
export function todayStr(tz = TZ) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date());
}

// ISO-Wochentag (1 = Montag … 7 = Sonntag) für ein reines Datum „YYYY-MM-DD".
export function isoWeekday(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = So … 6 = Sa
  return wd === 0 ? 7 : wd;
}

function tzOffsetMinutes(tz, date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUtc - date.getTime()) / 60000;
}

// "2026-07-14" + "10:30" in Zeitzone tz -> ISO-Zeitstempel (UTC).
// Zweiter Durchlauf fängt Verschiebungen an Sommerzeit-Grenzen ab.
export function zonedIso(dateStr, timeStr, tz = TZ) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mi] = timeStr.split(':').map(Number);
  const desired = Date.UTC(y, m - 1, d, hh, mi);
  let ts = desired - tzOffsetMinutes(tz, new Date(desired)) * 60000;
  ts = desired - tzOffsetMinutes(tz, new Date(ts)) * 60000;
  return new Date(ts).toISOString();
}
