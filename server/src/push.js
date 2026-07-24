import { db, getSetting, setSetting } from './db.js';

// Web-Push-Infrastruktur. Die Bibliothek „web-push" wird bewusst DYNAMISCH
// geladen: Fehlt sie (z. B. altes Deployment ohne `npm install`), bleibt Push
// deaktiviert und der In-Portal-Fallback greift – die App läuft normal weiter.

let webpush = null;
let vapidPublicKey = null;

export async function initPush() {
  try {
    webpush = (await import('web-push')).default;
  } catch {
    webpush = null;
    console.warn('[push] "web-push" nicht installiert – Push-Benachrichtigungen sind deaktiviert.');
    return;
  }
  let pub = getSetting('push_vapid_public');
  let priv = getSetting('push_vapid_private');
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    setSetting('push_vapid_public', pub);
    setSetting('push_vapid_private', priv);
    console.log('[push] Neue VAPID-Schlüssel erzeugt und gespeichert.');
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@localhost', pub, priv);
    vapidPublicKey = pub;
    console.log('[push] Web Push aktiv.');
  } catch (e) {
    webpush = null;
    console.warn('[push] VAPID-Konfiguration fehlgeschlagen:', e.message);
  }
}

export function pushAvailable() {
  return !!webpush && !!vapidPublicKey;
}

export function getPublicKey() {
  return vapidPublicKey;
}

// ---------- Abonnements ----------

export function saveSubscription(userId, sub) {
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  return true;
}

export function removeSubscription(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(
    userId,
    String(endpoint || '')
  );
}

export function subscriptionCount(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId).n;
}

// ---------- Versand ----------

async function sendToUser(userId, payload) {
  if (!pushAvailable() || !userId) return;
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data
        );
      } catch (e) {
        // Abgelaufene/ungültige Endpunkte entfernen; andere Fehler nur loggen.
        if (e.statusCode === 404 || e.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        } else {
          console.warn('[push] Senden fehlgeschlagen:', e.statusCode || e.message);
        }
      }
    })
  );
}

function fireAndForget(promise) {
  Promise.resolve(promise).catch((e) => console.warn('[push]', e.message));
}

function fmtDate(dateStr) {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(`${dateStr}T12:00:00Z`));
  } catch {
    return dateStr;
  }
}

// „genau einmal" je (Tag, Art, Nutzer): true, wenn erstmals protokolliert.
function claim(dayId, kind, userId) {
  const info = db
    .prepare('INSERT OR IGNORE INTO notification_log (day_id, kind, user_id) VALUES (?, ?, ?)')
    .run(dayId, kind, userId ?? null);
  return info.changes === 1;
}

// ---------- Auslöser ----------

export function notifyOrganizerAssigned(day, userId) {
  if (!day || !userId) return;
  if (!claim(day.id, 'organizer_assigned', userId)) return;
  fireAndForget(
    sendToUser(userId, {
      title: 'Du bist Organisator',
      body: `Du organisierst die Bestellung für ${fmtDate(day.date)}.`,
      tag: `organizer-${day.id}`,
      data: { url: '/organisation' },
    })
  );
}

export function notifyPhaseClosed(day) {
  if (!day || !day.organizer_id) return;
  if (!claim(day.id, 'phase_closed', day.organizer_id)) return;
  fireAndForget(
    sendToUser(day.organizer_id, {
      title: 'Bestellphase beendet',
      body: `Die Bestellungen für ${fmtDate(day.date)} sind vollständig – bitte jetzt sammeln und aufgeben.`,
      tag: `closed-${day.id}`,
      data: { url: '/organisation' },
    })
  );
}

export async function sendTest(userId) {
  if (!pushAvailable()) throw new Error('Push ist auf dem Server nicht verfügbar.');
  await sendToUser(userId, {
    title: 'Test-Benachrichtigung',
    body: 'Push-Benachrichtigungen sind aktiv. 🎉',
    tag: 'push-test',
    data: { url: '/einstellungen' },
  });
}
