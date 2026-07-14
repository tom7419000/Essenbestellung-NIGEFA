// Speisekarten-Import von Lieferando (Just Eat Takeaway).
//
// Datenquelle: Die Lieferando-Website ist eine SPA; die Speisekarte kommt aus
// der internen JSON-API `https://cw-api.takeaway.com/api/<version>/restaurant
// ?slug=<slug>` (Header x-country-code/x-language-code), nicht aus dem HTML.
// Diese API ist inoffiziell und kann sich ändern – deshalb: mehrere Versionen
// durchprobieren, tolerantes Parsen mehrerer Antwortformen und klare Fehler.

import { ImportError, dedupeItems, fetchText, makePriceMapper, toImportItem } from './util.js';

export function isLieferandoUrl(u) {
  const host = u.hostname.toLowerCase();
  return (
    /(^|\.)lieferando\.(de|at)$/.test(host) ||
    /(^|\.)takeaway\.com$/.test(host) ||
    /(^|\.)thuisbezorgd\.nl$/.test(host)
  );
}

export function extractSlug(u) {
  const m = u.pathname.match(/\/(?:speisekarte|menue?|menu|restaurant)\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  const segments = u.pathname.split('/').filter(Boolean);
  return segments.length > 0 ? decodeURIComponent(segments[segments.length - 1]) : null;
}

function extractPriceRaw(variantOrProduct) {
  const v = variantOrProduct || {};
  const candidates = [
    v.prices?.delivery,
    v.prices?.pickup,
    v.price,
    v.deliveryPrice,
    v.pickupPrice,
    v.prices?.price,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return null;
}

function descriptionOf(product) {
  const d = product?.description;
  if (Array.isArray(d)) return d.map((x) => String(x).trim()).filter(Boolean).join(' ');
  return String(d ?? '').trim();
}

// Toleranter Parser für die Restaurant-Antwort der cw-api:
// - Kategorien unter menu.categories (productIds als Liste ODER products inline)
// - Produktkatalog unter menu.products (Map nach Id oder Array)
// - Preise in Cent (Ganzzahlen) oder Euro (Dezimalwerte), je Variante
export function parseLieferandoResponse(json) {
  const menu = json?.menu ?? json?.data?.menu ?? json?.restaurant?.menu;
  const restaurantName =
    json?.brand?.name ?? json?.restaurant?.brand?.name ?? json?.restaurant?.name ?? json?.name ?? null;

  if (!menu || !Array.isArray(menu.categories)) {
    throw new ImportError(
      'Unerwartetes Antwortformat der Lieferando-API (menu.categories fehlt) – möglicherweise hat sich das Format geändert.'
    );
  }

  let products = menu.products ?? {};
  if (Array.isArray(products)) {
    products = Object.fromEntries(
      products.filter((p) => p && (p.id ?? p.productId) != null).map((p) => [String(p.id ?? p.productId), p])
    );
  }

  const categoryProducts = menu.categories.map((cat) => {
    const name = String(cat?.name ?? '').trim();
    let prods = [];
    if (Array.isArray(cat?.productIds)) {
      prods = cat.productIds.map((id) => products[String(id)]).filter(Boolean);
    } else if (Array.isArray(cat?.products)) {
      prods = cat.products
        .map((p) => (p && typeof p === 'object' ? p : products[String(p)]))
        .filter(Boolean);
    }
    return [name, prods];
  });

  // Erst alle Rohpreise einsammeln (Cent-vs-Euro-Entscheidung), dann Items bauen.
  const rawPrices = [];
  for (const [, prods] of categoryProducts) {
    for (const p of prods) {
      const variants = Array.isArray(p?.variants) && p.variants.length > 0 ? p.variants : [p];
      for (const v of variants) {
        const raw = extractPriceRaw(v);
        if (raw != null) rawPrices.push(raw);
      }
    }
  }
  const toCents = makePriceMapper(rawPrices);

  const items = [];
  let skipped = 0;
  for (const [categoryName, prods] of categoryProducts) {
    for (const p of prods) {
      const baseName = String(p?.name ?? '').trim();
      if (!baseName) {
        skipped += 1;
        continue;
      }
      const variants = Array.isArray(p?.variants) && p.variants.length > 0 ? p.variants : [null];
      for (const variant of variants) {
        const variantName = String(variant?.name ?? '').trim();
        const name = variants.length > 1 && variantName ? `${baseName} (${variantName})` : baseName;
        items.push(
          toImportItem({
            category: categoryName,
            name,
            description: descriptionOf(p),
            priceCents: toCents(extractPriceRaw(variant ?? p)),
          })
        );
      }
    }
  }

  const { items: deduped, duplicates } = dedupeItems(items);
  const warnings = [];
  if (skipped > 0) warnings.push(`${skipped} Einträge ohne Namen wurden übersprungen.`);
  if (duplicates > 0) warnings.push(`${duplicates} doppelte Gerichtnamen wurden zusammengefasst.`);
  return { restaurantName, items: deduped, warnings };
}

export async function importLieferando(u) {
  const slug = extractSlug(u);
  if (!slug) {
    throw new ImportError(
      'Der Restaurant-Name (Slug) konnte aus der URL nicht ermittelt werden – erwartet wird z. B. https://www.lieferando.de/speisekarte/<restaurant>.'
    );
  }

  const base = process.env.LIEFERANDO_API_BASE || 'https://cw-api.takeaway.com/api';
  const versions = (process.env.LIEFERANDO_API_VERSIONS || 'v34,v33')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let lastError = null;
  for (const version of versions) {
    try {
      const text = await fetchText(`${base}/${version}/restaurant?slug=${encodeURIComponent(slug)}`, {
        headers: {
          accept: 'application/json',
          'x-country-code': 'de',
          'x-language-code': 'de',
        },
      });
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ImportError('Die Antwort der Lieferando-API war kein JSON.');
      }
      const result = parseLieferandoResponse(json);
      if (result.items.length > 0) return result;
      lastError = new ImportError('Die Antwort enthielt keine Gerichte.');
    } catch (e) {
      lastError = e;
    }
  }

  throw new ImportError(
    `Import von Lieferando fehlgeschlagen: ${lastError?.message ?? 'unbekannter Fehler'} ` +
      'Hinweis: Lieferando blockiert teilweise automatisierte Zugriffe; es kann helfen, es später erneut zu versuchen.'
  );
}
