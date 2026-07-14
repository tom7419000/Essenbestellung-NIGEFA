import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { ImportError, importMenuFromUrl } from '../menuImport/index.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Liest die Speisekarte einer externen Seite (Lieferando/Gastromia) aus und
// liefert eine Vorschau zurück. Gespeichert wird erst über
// POST /api/restaurants/:id/menu/import-items – so kann der Admin das
// Ergebnis prüfen und korrigieren.
router.post('/preview', async (req, res) => {
  try {
    const result = await importMenuFromUrl(req.body?.url);
    res.json(result);
  } catch (e) {
    if (e instanceof ImportError) {
      return res.status(422).json({ message: e.message });
    }
    console.error('Menü-Import fehlgeschlagen:', e);
    res.status(502).json({ message: 'Import fehlgeschlagen (unerwarteter Fehler).' });
  }
});

export default router;
