import { ImportError, assertPublicHttpUrl } from './util.js';
import { importLieferando, isLieferandoUrl } from './lieferando.js';

export { ImportError };

// Erkennt den Anbieter anhand der URL bzw. des Seiteninhalts und liefert die
// geparste Speisekarte als Vorschau zurück (noch ohne zu speichern).
export async function importMenuFromUrl(rawUrl) {
  const u = assertPublicHttpUrl(rawUrl);

  if (isLieferandoUrl(u)) {
    return { provider: 'lieferando', ...(await importLieferando(u)) };
  }

  throw new ImportError(
    'Diese URL wird nicht unterstützt. Unterstützt werden Lieferando-Restaurantseiten (z. B. https://www.lieferando.de/speisekarte/<restaurant>).'
  );
}
