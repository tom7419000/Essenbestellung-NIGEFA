import { addDays, combineDateAndTime, toHHmm, weekdayOf } from './time.util';

describe('time.util — Fristberechnung in Zeitzonen', () => {
  it('kombiniert Datum + Uhrzeit in Europe/Berlin (Sommerzeit, UTC+2)', () => {
    const deadline = combineDateAndTime('2026-07-13', '10:00', 'Europe/Berlin');
    expect(deadline.toISOString()).toBe('2026-07-13T08:00:00.000Z');
  });

  it('berücksichtigt die Winterzeit (UTC+1)', () => {
    const deadline = combineDateAndTime('2026-01-13', '10:00', 'Europe/Berlin');
    expect(deadline.toISOString()).toBe('2026-01-13T09:00:00.000Z');
  });

  it('akzeptiert auch HH:mm:ss aus der Datenbank', () => {
    const deadline = combineDateAndTime('2026-07-13', '11:30:00', 'Europe/Berlin');
    expect(deadline.toISOString()).toBe('2026-07-13T09:30:00.000Z');
  });

  it('wirft bei ungültiger Zeitzone', () => {
    expect(() => combineDateAndTime('2026-07-13', '10:00', 'Nirgendwo/Stadt')).toThrow();
  });

  it('toHHmm normalisiert Zeitformate', () => {
    expect(toHHmm('10:00:00')).toBe('10:00');
    expect(toHHmm('09:15')).toBe('09:15');
  });

  it('weekdayOf: 0 = Sonntag … 6 = Samstag', () => {
    expect(weekdayOf('2026-07-13')).toBe(1); // Montag
    expect(weekdayOf('2026-07-12')).toBe(0); // Sonntag
    expect(weekdayOf('2026-07-18')).toBe(6); // Samstag
  });

  it('addDays rechnet über Monatsgrenzen', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
