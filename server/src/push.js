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

// Liefert {delivered, failed}: Anzahl der Geräte, die erreicht wurden bzw.
// nicht. Die bestehenden Auslöser ignorieren den Rückgabewert; die
// Rundnachricht wertet ihn für die Zusammenfassung aus.
async function sendToUser(userId, payload) {
  if (!pushAvailable() || !userId) return { delivered: 0, failed: 0 };
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  const data = JSON.stringify(payload);
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data
        );
        return true;
      } catch (e) {
        // Abgelaufene/ungültige Endpunkte entfernen; andere Fehler nur loggen.
        if (e.statusCode === 404 || e.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        } else {
          console.warn('[push] Senden fehlgeschlagen:', e.statusCode || e.message);
        }
        return false;
      }
    })
  );
  return {
    delivered: results.filter(Boolean).length,
    failed: results.filter((ok) => !ok).length,
  };
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

// ---------- Rundnachricht an alle Abonnenten (Admin) ----------

// Ziele im Portal, auf die eine Rundnachricht verlinken darf. Bewusst eine
// feste Liste statt freier URLs: verhindert Weiterleitungen nach außen.
export const BROADCAST_TARGETS = [
  { value: '/', label: 'Startseite (Abstimmung & Bestellung)' },
  { value: '/meine-bestellungen', label: 'Meine Bestellungen' },
  { value: '/organisation', label: 'Organisation' },
  { value: '/einstellungen', label: 'Einstellungen & Rückblick' },
];

// Zustand des letzten Versands. Bewusst nur im Arbeitsspeicher: die Angabe
// ist eine kurzlebige Rückmeldung für den Admin, kein Protokoll.
let lastBroadcast = null;
export function getBroadcastStatus() {
  return lastBroadcast;
}

// Empfänger = Konten mit mindestens einem Abonnement, die weder gesperrt
// noch deaktiviert sind.
function broadcastRecipients() {
  return db
    .prepare(
      `SELECT DISTINCT s.user_id AS userId
       FROM push_subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE u.is_active = 1 AND u.is_blocked = 0`
    )
    .all()
    .map((r) => r.userId);
}

export function countBroadcastRecipients() {
  return broadcastRecipients().length;
}

// Versand im Hintergrund, in Blöcken – so blockiert die Antwort an den Admin
// nicht und viele Zustellungen überlasten den Push-Dienst nicht.
async function runBroadcast(userIds, payload) {
  const CHUNK = 10;
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map((id) =>
        sendToUser(id, payload).then(
          (r) => r.delivered > 0,
          () => false
        )
      )
    );
    // Gezählt wird pro Nutzer: erreicht, sobald mindestens ein Gerät die
    // Nachricht angenommen hat.
    for (const ok of results) {
      if (ok) sent += 1;
      else failed += 1;
    }
    lastBroadcast = { ...lastBroadcast, sent, failed };
  }
  lastBroadcast = { ...lastBroadcast, sent, failed, running: false, finishedAt: new Date().toISOString() };
}

// Startet den Versand und kehrt sofort zurück. Liefert die Empfängerzahl,
// das Ergebnis holt der Client anschließend über getBroadcastStatus().
export function startBroadcast({ title, body, url }) {
  if (!pushAvailable()) throw new Error('Push ist auf dem Server nicht verfügbar.');
  const userIds = broadcastRecipients();
  lastBroadcast = {
    title,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    recipients: userIds.length,
    sent: 0,
    failed: 0,
    running: userIds.length > 0,
  };
  if (userIds.length === 0) {
    lastBroadcast.running = false;
    lastBroadcast.finishedAt = lastBroadcast.startedAt;
    return lastBroadcast;
  }
  fireAndForget(
    runBroadcast(userIds, {
      title,
      body,
      tag: 'broadcast',
      data: { url: url || '/' },
    })
  );
  return lastBroadcast;
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
