import { ImportError, assertPublicHttpUrl, fetchText } from './util.js';
import { importLieferando, isLieferandoUrl } from './lieferando.js';
import { importGastromia, isGastromiaPage } from './gastromia.js';

export { ImportError };

// Erkennt den Anbieter anhand der URL bzw. des Seiteninhalts und liefert die
// geparste Speisekarte als Vorschau zurück (noch ohne zu speichern).
export async function importMenuFromUrl(rawUrl) {
  const u = await assertPublicHttpUrl(rawUrl);

  if (isLieferandoUrl(u)) {
    return { provider: 'lieferando', ...(await importLieferando(u)) };
  }

  // Andere Domains: Seite laden und auf Gastromia-Merkmale prüfen
  // ("Powered by GASTROMIA" bzw. weborder.gastromia.de).
  const html = await fetchText(u.toString(), {
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
  if (isGastromiaPage(u, html)) {
    return { provider: 'gastromia', ...(await importGastromia(u, html)) };
  }

  throw new ImportError(
    'Diese URL wird nicht unterstützt. Unterstützt werden Lieferando-Restaurantseiten und Gastromia-basierte WebOrder-Seiten.'
  );
}
