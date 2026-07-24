import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  getPublicKey,
  pushAvailable,
  removeSubscription,
  saveSubscription,
  sendTest,
  subscriptionCount,
} from '../push.js';

const router = Router();
router.use(requireAuth);

// Öffentlicher VAPID-Schlüssel + Status (für die Client-Anmeldung).
router.get('/public-key', (req, res) => {
  res.json({
    available: pushAvailable(),
    publicKey: getPublicKey(),
    subscribed: subscriptionCount(req.user.id) > 0,
  });
});

router.post('/subscribe', (req, res) => {
  if (!pushAvailable()) {
    return res.status(503).json({ message: 'Push ist auf dem Server nicht verfügbar.' });
  }
  const ok = saveSubscription(req.user.id, req.body);
  if (!ok) return res.status(400).json({ message: 'Ungültiges Push-Abonnement.' });
  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  removeSubscription(req.user.id, req.body?.endpoint);
  res.json({ ok: true });
});

router.post('/test', async (req, res) => {
  try {
    await sendTest(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ message: e.message });
  }
});

export default router;
