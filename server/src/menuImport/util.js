// Gemeinsame Helfer für die Speisekarten-Importer (Lieferando, Gastromia).

import dns from 'node:dns/promises';
import net from 'node:net';

export class ImportError extends Error {}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Prüft, ob eine (aufgelöste) IP-Adresse in einem privaten/reservierten
// Bereich liegt – IPv4 und IPv6, inklusive Cloud-Metadaten (169.254.169.254),
// CGNAT und IPv4-mapped IPv6.
export function ipIsPrivate(ip) {
  const type = net.isIP(ip);
  if (type === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Link-local + Cloud-Metadaten
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserviert
    return false;
  }
  if (type === 6) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('fe80')) return true; // Link-local
    if (s.startsWith('fc') || s.startsWith('fd')) return true; // Unique Local (fc00::/7)
    const mapped = s.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipIsPrivate(mapped[1]); // IPv4-mapped
    return false;
  }
  return true; // nicht parsebar -> als unsicher behandeln
}

// Nur öffentliche http(s)-Ziele zulassen (SSRF-Schutz). Es wird die
// TATSÄCHLICH aufgelöste IP geprüft (nicht nur der Hostname-Text), damit
// weder Hostnamen, die auf interne IPs zeigen, noch alternative
// IP-Schreibweisen (z. B. http://2130706433/) durchkommen.
// MENU_IMPORT_ALLOW_PRIVATE=1 hebt die Sperre auf (nur für Tests).
export async function assertPublicHttpUrl(raw) {
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

  const host = u.hostname.replace(/^\[|\]$/g, ''); // IPv6-Klammern entfernen
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new ImportError('Diese Adresse ist nicht erlaubt.');
    return u;
  }
  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new ImportError('Der Hostname konnte nicht aufgelöst werden.');
  }
  if (addresses.length === 0) {
    throw new ImportError('Der Hostname konnte nicht aufgelöst werden.');
  }
  for (const { address } of addresses) {
    if (ipIsPrivate(address)) {
      throw new ImportError('Diese Adresse verweist auf ein internes Ziel und ist nicht erlaubt.');
    }
  }
  return u;
}

// Ruft eine externe Seite ab und folgt Weiterleitungen MANUELL, wobei jeder
// Hop erneut per DNS-Auflösung validiert wird (Schutz vor Redirect-to-internal).
// Mit Timeout und Größenlimit gegen langsame/große Antworten (DoS).
export async function fetchText(url, { headers = {}, timeoutMs = 12_000, maxBytes = 4_000_000, maxRedirects = 5 } = {}) {
  let current = String(url);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpUrl(current); // jeder Hop wird geprüft
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res;
      try {
        res = await fetch(current, {
          headers: { 'user-agent': USER_AGENT, ...headers },
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (e) {
        const reason = e?.name === 'AbortError' ? 'Zeitüberschreitung' : e?.cause?.code || e?.message || 'Netzwerkfehler';
        throw new ImportError(
          `Die Seite ist nicht erreichbar (${reason}). Bitte URL und Internetzugang des Servers prüfen.`
        );
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new ImportError('Ungültige Weiterleitung der Zielseite.');
        current = new URL(location, current).toString();
        continue; // nächster Hop wird oben erneut validiert
      }
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
  throw new ImportError('Zu viele Weiterleitungen.');
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
