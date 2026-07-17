import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { rateLimit } from '../rateLimit.js';
import { ImportError, importMenuFromUrl } from '../menuImport/index.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Import ruft im Auftrag des Nutzers externe URLs ab – Häufigkeit begrenzen
// (H3), damit die Funktion nicht für Massenabfragen missbraucht wird.
const importLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Zu viele Import-Anfragen. Bitte etwas später erneut versuchen.',
});

// Liest die Speisekarte einer externen Seite (Lieferando/Gastromia) aus und
// liefert eine Vorschau zurück. Gespeichert wird erst über
// POST /api/restaurants/:id/menu/import-items – so kann der Admin das
// Ergebnis prüfen und korrigieren.
router.post('/preview', importLimiter, async (req, res) => {
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
