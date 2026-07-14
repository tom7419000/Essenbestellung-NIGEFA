import { PublicClientApplication } from '@azure/msal-browser';

// Konfiguration aus client/.env (VITE_-Variablen werden beim Build eingebettet).
// Ohne Client-/Tenant-ID bleibt SSO deaktiviert und nur die lokale Anmeldung aktiv.
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID;
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID;

export const ssoEnabled = Boolean(clientId && tenantId);
export const ssoAutoRedirect = ssoEnabled && import.meta.env.VITE_ENTRA_AUTO_REDIRECT === '1';

// Merker, dass die aktuelle Sitzung per SSO entstand – dann beendet
// „Abmelden“ auch die Entra-ID-Sitzung (logoutRedirect).
export const SSO_FLAG_KEY = 'essensbestellung.sso';

export const msalInstance = ssoEnabled
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin,
        postLogoutRedirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    })
  : null;
