import { Router } from 'express';
import { getSetting, setSetting } from '../db.js';
import { requireAuth, requirePlanner } from '../auth.js';

const router = Router();
// Planungs-Standardeinstellungen gehören zur Tagesplanung und sind daher auch
// für die Berechtigung „Planung" zugänglich (nicht nur für Administratoren).
router.use(requireAuth, requirePlanner);

const ORGANIZER_MODES = ['manuell', 'freiwillig', 'zufaellig'];

router.get('/', (req, res) => {
  res.json({
    defaultPhase1Time: getSetting('default_phase1_time', '10:30'),
    defaultPhase2Time: getSetting('default_phase2_time', '11:45'),
    defaultOrganizerMode: getSetting('default_organizer_mode', 'manuell'),
  });
});

router.put('/', (req, res) => {
  const { defaultPhase1Time, defaultPhase2Time, defaultOrganizerMode } = req.body || {};
  const valid = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
  if (!valid(defaultPhase1Time) || !valid(defaultPhase2Time)) {
    return res.status(400).json({ message: 'Bitte gültige Uhrzeiten im Format HH:MM angeben.' });
  }
  if (!ORGANIZER_MODES.includes(defaultOrganizerMode)) {
    return res.status(400).json({ message: 'Ungültiger Organisator-Modus.' });
  }
  setSetting('default_phase1_time', defaultPhase1Time);
  setSetting('default_phase2_time', defaultPhase2Time);
  setSetting('default_organizer_mode', defaultOrganizerMode);
  res.json({ ok: true });
});

export default router;
