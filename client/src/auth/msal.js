import { PublicClientApplication } from '@azure/msal-browser';
import { api } from '../api.js';

// Merker, dass die aktuelle Sitzung per SSO entstand – dann beendet
// „Abmelden“ auch die Entra-ID-Sitzung (logoutRedirect).
export const SSO_FLAG_KEY = 'essensbestellung.sso';

let instance = null;
let runtimeConfig = { enabled: false, autoRedirect: false };

// SSO-Konfiguration zur Laufzeit vom Server laden (Admin → Anmeldung (SSO))
// und MSAL initialisieren. Kein Build mit VITE_-Variablen mehr nötig –
// Änderungen im Admin-Bereich wirken sofort.
export async function initSso() {
  try {
    runtimeConfig = await api('/sso/config');
  } catch {
    runtimeConfig = { enabled: false, autoRedirect: false };
  }
  if (runtimeConfig.enabled) {
    instance = new PublicClientApplication({
      auth: {
        clientId: runtimeConfig.clientId,
        authority: `https://login.microsoftonline.com/${runtimeConfig.tenantId}`,
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await instance.initialize();
  } else {
    instance = null;
  }
  return { config: runtimeConfig, instance };
}

export const getMsalInstance = () => instance;
