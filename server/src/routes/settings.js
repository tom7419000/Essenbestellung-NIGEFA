import { Router } from 'express';
import { getSetting, setSetting } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  res.json({
    defaultPhase1Time: getSetting('default_phase1_time', '10:30'),
    defaultPhase2Time: getSetting('default_phase2_time', '11:45'),
  });
});

router.put('/', (req, res) => {
  const { defaultPhase1Time, defaultPhase2Time } = req.body || {};
  const valid = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
  if (!valid(defaultPhase1Time) || !valid(defaultPhase2Time)) {
    return res.status(400).json({ message: 'Bitte gültige Uhrzeiten im Format HH:MM angeben.' });
  }
  setSetting('default_phase1_time', defaultPhase1Time);
  setSetting('default_phase2_time', defaultPhase2Time);
  res.json({ ok: true });
});

export default router;
