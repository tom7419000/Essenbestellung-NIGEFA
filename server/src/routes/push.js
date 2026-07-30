import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { auditLog } from '../audit.js';
import {
  BROADCAST_TARGETS,
  countBroadcastRecipients,
  getBroadcastStatus,
  getPublicKey,
  pushAvailable,
  removeSubscription,
  saveSubscription,
  sendTest,
  startBroadcast,
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

// ---------- Rundnachricht (nur Administratoren) ----------
// requireAdmin prüft die Rolle serverseitig; „Planung" reicht ausdrücklich
// nicht aus.

router.get('/broadcast', requireAdmin, (req, res) => {
  res.json({
    available: pushAvailable(),
    recipients: countBroadcastRecipients(),
    targets: BROADCAST_TARGETS,
    last: getBroadcastStatus(),
  });
});

router.post('/broadcast', requireAdmin, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const url = String(req.body?.url || '').trim();
  if (!title || !body) {
    return res.status(400).json({ message: 'Bitte Titel und Nachricht angeben.' });
  }
  if (title.length > 80 || body.length > 300) {
    return res.status(400).json({ message: 'Titel max. 80, Nachricht max. 300 Zeichen.' });
  }
  if (url && !BROADCAST_TARGETS.some((t) => t.value === url)) {
    return res.status(400).json({ message: 'Unbekanntes Ziel im Portal.' });
  }
  try {
    // Startet den Versand im Hintergrund und antwortet sofort (202).
    const status = startBroadcast({ title, body, url });
    auditLog('push_broadcast', req, { title, recipients: status.recipients });
    res.status(202).json({ status });
  } catch (e) {
    res.status(503).json({ message: e.message });
  }
});

export default router;
