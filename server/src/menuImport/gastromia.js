// Speisekarten-Import von Gastromia-basierten WebOrder-Seiten
// (weborder.gastromia.de, oft unter eigener Restaurant-Domain eingebunden).
//
// Diese Seiten sind Next.js-Anwendungen. Strategie in drei Stufen:
//   1. __NEXT_DATA__ im HTML: Bei SSR/SSG liegen die Daten bereits im
//      Seitenquelltext als JSON.
//   2. Next.js-Datenroute /_next/data/<buildId>/<pfad>.json: liefert die
//      pageProps als reines JSON, auch wenn das HTML sie nicht enthält.
//   3. Optionales Headless-Rendering (Playwright, falls installiert):
//      lädt die Seite im Browser und fängt die JSON-Antworten der internen
//      API ab (entspricht dem Blick in den Netzwerk-Tab).
// Da das Datenformat nicht dokumentiert ist, arbeitet der Parser generisch:
// Er sucht im JSON nach kategorie-/gerichtartigen Strukturen.

import { createRequire } from 'node:module';
import { parsePriceToCents } from '../csv.js';
import { ImportError, dedupeItems, fetchText, makePriceMapper, toImportItem } from './util.js';

const ITEM_ARRAY_KEYS = new Set([
  'items',
  'articles',
  'artikel',
  'products',
  'dishes',
  'entries',
  'menuitems',
  'positions',
]);
const NAME_KEYS = ['name', 'title', 'bezeichnung', 'label'];
const DESC_KEYS = ['description', 'desc', 'beschreibung', 'text', 'subtitle', 'info'];
const PRICE_KEYS = [
  'price',
  'pricecents',
  'price_cents',
  'gross',
  'grossprice',
  'amount',
  'unitprice',
  'baseprice',
  'preis',
];
const PRICE_SUBKEYS = ['amount', 'gross', 'value', 'cents', 'delivery', 'pickup'];

export function isGastromiaPage(u, html) {
  return /(^|\.)weborder\.gastromia\.de$/i.test(u.hostname) || /gastromia/i.test(String(html));
}

export function extractNextData(html) {
  const m = String(html).match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function stringField(obj, keys) {
  for (const k of keys) {
    for (const variant of [k, k.toLowerCase(), k.toUpperCase()]) {
      const v = obj?.[variant];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
}

// Preis eines Eintrags finden: Zahl (Cent oder Euro), Preis-Objekt oder
// String wie "8,50 €". Rückgabe { num } für Zahlen (Einheit wird später
// heuristisch bestimmt) bzw. { cents } für bereits eindeutige Werte.
function priceRawOf(obj) {
  for (const [key, value] of Object.entries(obj || {})) {
    if (!PRICE_KEYS.includes(key.toLowerCase())) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return { num: value };
    if (typeof value === 'string' && value.trim()) {
      const cents = parsePriceToCents(value.replace(/[^\d.,€]/g, ''));
      if (cents !== undefined && cents !== null) return { cents };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const sub of PRICE_SUBKEYS) {
        const vv = value[sub];
        if (typeof vv === 'number' && Number.isFinite(vv) && vv >= 0) return { num: vv };
      }
    }
  }
  return null;
}

function isItemLike(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    Boolean(stringField(obj, NAME_KEYS)) &&
    priceRawOf(obj) !== null
  );
}

// Durchsucht beliebiges JSON nach Kategorie-/Gerichtslisten.
export function collectMenuGroups(root) {
  const groups = [];
  const fallback = [];
  const seenArrays = new Set();
  const stack = [{ node: root, depth: 0 }];

  while (stack.length > 0) {
    const { node, depth } = stack.pop();
    if (!node || typeof node !== 'object' || depth > 14) continue;

    if (Array.isArray(node)) {
      for (const child of node) stack.push({ node: child, depth: depth + 1 });
      continue;
    }

    const containerName = stringField(node, NAME_KEYS);
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value) && value.length > 0 && !seenArrays.has(value)) {
        const itemish = value.filter(isItemLike).length;
        const mostlyItems = itemish >= Math.max(1, Math.ceil(value.length * 0.6));
        if (mostlyItems && ITEM_ARRAY_KEYS.has(key.toLowerCase())) {
          seenArrays.add(value);
          groups.push({ category: containerName, entries: value });
          continue;
        }
        if (itemish >= 2) {
          seenArrays.add(value);
          fallback.push({ category: containerName, entries: value });
          continue;
        }
      }
      if (value && typeof value === 'object') stack.push({ node: value, depth: depth + 1 });
    }
  }
  return groups.length > 0 ? groups : fallback;
}

export function findRestaurantName(json) {
  const p = json?.props?.pageProps ?? json?.pageProps ?? json ?? {};
  const candidates = [
    p?.restaurant?.name,
    p?.shop?.name,
    p?.company?.name,
    p?.tenant?.name,
    p?.settings?.restaurantName,
    p?.restaurantName,
    p?.shopName,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export function parseGastromiaData(json) {
  const groups = collectMenuGroups(json);
  if (groups.length === 0) return { restaurantName: findRestaurantName(json), items: [], warnings: [] };

  const rawNumbers = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      const raw = priceRawOf(entry);
      if (raw && typeof raw.num === 'number') rawNumbers.push(raw.num);
    }
  }
  const toCents = makePriceMapper(rawNumbers);

  const items = [];
  let skipped = 0;
  for (const group of groups) {
    for (const entry of group.entries) {
      const name = stringField(entry, NAME_KEYS);
      if (!name) {
        skipped += 1;
        continue;
      }
      const raw = priceRawOf(entry);
      const priceCents = raw ? (raw.cents ?? toCents(raw.num)) : null;
      items.push(
        toImportItem({
          category: group.category,
          name,
          description: stringField(entry, DESC_KEYS),
          priceCents,
        })
      );
    }
  }

  const { items: deduped, duplicates } = dedupeItems(items);
  const warnings = [];
  if (skipped > 0) warnings.push(`${skipped} Einträge ohne Namen wurden übersprungen.`);
  if (duplicates > 0) warnings.push(`${duplicates} doppelte Gerichtnamen wurden zusammengefasst.`);
  return { restaurantName: findRestaurantName(json), items: deduped, warnings };
}

// Stufe 3: Headless-Rendering (optional). Erfordert das npm-Paket
// "playwright" im server-Verzeichnis sowie einen installierten Chromium
// (siehe docs/speisekarten-import.md). Fehlt beides, wird ein Hinweis
// als Warnung zurückgegeben statt zu scheitern.
async function tryHeadless(u, warnings) {
  let playwright = null;
  try {
    const require = createRequire(import.meta.url);
    playwright = require('playwright');
  } catch {
    warnings.push(
      'Headless-Rendering nicht verfügbar (optionales Paket „playwright“ ist nicht installiert).'
    );
    return null;
  }

  let browser = null;
  try {
    browser = await playwright.chromium.launch({
      executablePath: process.env.MENU_IMPORT_CHROMIUM_PATH || undefined,
    });
    const page = await (await browser.newContext()).newPage();
    const captured = [];
    page.on('response', (res) => {
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      if (!ct.includes('json')) return;
      res
        .body()
        .then((body) => {
          if (body.length > 2_000_000) return;
          try {
            captured.push(JSON.parse(body.toString('utf8')));
          } catch {
            /* kein JSON */
          }
        })
        .catch(() => {});
    });
    await page.goto(u.toString(), { waitUntil: 'networkidle', timeout: 25_000 });
    await page.waitForTimeout(500);

    let best = null;
    for (const json of captured) {
      try {
        const result = parseGastromiaData(json);
        if (result.items.length > (best?.items.length ?? 0)) best = result;
      } catch {
        /* Kandidat verwerfen */
      }
    }
    return best && best.items.length > 0 ? best : null;
  } catch (e) {
    warnings.push(`Headless-Rendering fehlgeschlagen: ${e.message}`);
    return null;
  } finally {
    try {
      await browser?.close();
    } catch {
      /* bereits geschlossen */
    }
  }
}

export async function importGastromia(u, html) {
  const warnings = [];

  // Stufe 1: __NEXT_DATA__ direkt aus dem HTML
  const nextData = extractNextData(html);
  if (nextData) {
    const result = parseGastromiaData(nextData);
    if (result.items.length > 0) return { ...result, warnings: [...warnings, ...result.warnings] };

    // Stufe 2: Next.js-Datenroute mit der buildId aus __NEXT_DATA__
    if (nextData.buildId) {
      const path = u.pathname === '/' ? '/index' : u.pathname.replace(/\/$/, '');
      const dataUrl = new URL(`/_next/data/${nextData.buildId}${path}.json${u.search}`, u).toString();
      try {
        const json = JSON.parse(await fetchText(dataUrl, { headers: { accept: 'application/json' } }));
        const result2 = parseGastromiaData(json);
        if (result2.items.length > 0) {
          return { ...result2, warnings: [...warnings, ...result2.warnings] };
        }
        warnings.push('Die Next.js-Datenroute enthielt keine Speisekarte.');
      } catch (e) {
        warnings.push(`Next.js-Datenroute nicht nutzbar (${e.message}).`);
      }
    }
  } else {
    warnings.push('Kein __NEXT_DATA__ im Seitenquelltext gefunden.');
  }

  // Stufe 3: Headless-Rendering
  const headless = await tryHeadless(u, warnings);
  if (headless) {
    return { ...headless, warnings: [...warnings, ...headless.warnings] };
  }

  throw new ImportError(
    `Gastromia-Seite erkannt, aber die Speisekarte konnte nicht ausgelesen werden. ${warnings.join(' ')} ` +
      'Möglicherweise hat sich das Seitenformat geändert.'
  );
}
