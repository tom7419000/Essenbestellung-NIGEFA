// Gemeinsame Helfer für die Speisekarten-Importer (Lieferando, Gastromia).

export class ImportError extends Error {}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Nur öffentliche http(s)-Ziele zulassen (Schutz vor SSRF auf interne Dienste).
// MENU_IMPORT_ALLOW_PRIVATE=1 hebt die Sperre auf (nur für Tests gedacht).
export function assertPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw new ImportError('Ungültige URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ImportError('Nur http(s)-URLs werden unterstützt.');
  }
  if (process.env.MENU_IMPORT_ALLOW_PRIVATE === '1') return u;
  const host = u.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    /^127\./.test(host) ||
    /^0\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) throw new ImportError('Diese Adresse ist nicht erlaubt.');
  return u;
}

export async function fetchText(url, { headers = {}, timeoutMs = 12_000, maxBytes = 4_000_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, ...headers },
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (e) {
      const reason = e?.name === 'AbortError' ? 'Zeitüberschreitung' : e?.cause?.code || e?.message || 'Netzwerkfehler';
      throw new ImportError(
        `Die Seite ist nicht erreichbar (${reason}). Bitte URL und Internetzugang des Servers prüfen.`
      );
    }
    // Weiterleitungen könnten auf interne Adressen zeigen – Ziel erneut prüfen.
    assertPublicHttpUrl(res.url || url);
    if (!res.ok) {
      throw new ImportError(
        `Die Seite antwortete mit HTTP ${res.status}${res.status === 403 ? ' – automatisierte Zugriffe werden offenbar blockiert' : ''}.`
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new ImportError('Die Antwort ist zu groß.');
    return buf.toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

// Preisangaben können je nach Quelle Cent-Ganzzahlen (850) oder Euro-Dezimal-
// werte (8.5) sein. Entscheidung einmal pro Import über alle Werte: Sind alle
// Zahlen ganzzahlig, werden sie als Cent interpretiert, sonst als Euro.
export function makePriceMapper(rawNumbers) {
  const nums = rawNumbers.filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  const allInts = nums.length > 0 && nums.every((n) => Number.isInteger(n));
  return (n) => {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
    const cents = allInts ? Math.round(n) : Math.round(n * 100);
    return cents > 1_000_000 ? null : cents;
  };
}

// Importiertes Gericht auf das interne Format bringen (Längen begrenzen).
export function toImportItem({ category = '', name = '', description = '', allergens = '', priceCents = null }) {
  return {
    category: String(category).trim().slice(0, 60),
    name: String(name).trim().slice(0, 120),
    description: String(description).trim().slice(0, 300),
    allergens: String(allergens).trim().slice(0, 120),
    priceCents: Number.isInteger(priceCents) && priceCents >= 0 ? priceCents : null,
  };
}

// Doppelte Namen entfernen (erste Nennung gewinnt) – die Datenbank erzwingt
// eindeutige Namen je Restaurant.
export function dedupeItems(items) {
  const seen = new Set();
  const result = [];
  let duplicates = 0;
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (!item.name) continue;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return { items: result, duplicates };
}
