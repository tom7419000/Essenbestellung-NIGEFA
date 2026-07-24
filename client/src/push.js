import { api } from './api.js';

// Client-Helfer für Web-Push. Kapselt Service-Worker-Registrierung,
// Browser-Berechtigung und An-/Abmeldung beim Server.

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

let swRegistration = null;

export async function registerServiceWorker() {
  if (!pushSupported()) return null;
  if (swRegistration) return swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    return swRegistration;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// Serverstatus: ist Push serverseitig verfügbar, bin ich bereits abonniert?
export async function fetchPushStatus() {
  try {
    return await api('/push/public-key');
  } catch {
    return { available: false, publicKey: null, subscribed: false };
  }
}

// Fordert (bei Bedarf) die Berechtigung an und meldet dieses Gerät beim Server an.
// Muss aus einer Nutzergeste heraus aufgerufen werden (Browser-Anforderung).
export async function enablePush() {
  if (!pushSupported()) throw new Error('Dein Browser unterstützt keine Push-Benachrichtigungen.');
  const status = await fetchPushStatus();
  if (!status.available || !status.publicKey) {
    throw new Error('Push ist auf dem Server nicht verfügbar.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  }
  const reg = await registerServiceWorker();
  if (!reg) throw new Error('Service Worker konnte nicht registriert werden.');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    });
  }
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return true;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await registerServiceWorker();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(
      () => {}
    );
    await sub.unsubscribe().catch(() => {});
  }
}

export async function sendTestPush() {
  await api('/push/test', { method: 'POST' });
}
