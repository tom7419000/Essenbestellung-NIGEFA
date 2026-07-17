// Entra-ID-SSO: Konfiguration und Workload Identity Federation.
//
// Zwei getrennte Mechanismen:
// 1. Benutzer-Login: Public Client (SPA) mit Authorization Code + PKCE über
//    MSAL – benötigt konstruktionsbedingt kein Secret. Der Server validiert
//    das erhaltene ID-Token (siehe routes/auth.js).
// 2. App-Anmeldung des Servers (Verbundanmeldeinformation / Federated
//    Identity Credential): Statt eines Client-Secrets signiert der Server
//    eine Client-Assertion mit seinem eigenen Schlüsselpaar. Das Portal
//    stellt dafür OIDC-Discovery- und JWKS-Endpunkte bereit, die Entra ID
//    zur Signaturprüfung abruft. Verwendet für „Verbindung testen“ und
//    künftige Graph-Zugriffe. In Azure werden dazu Issuer-URL, Subject und
//    Audience der Verbundanmeldeinformation hinterlegt.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { dataDir, getSetting, setSetting } from './db.js';

export const DEFAULT_FIC_SUBJECT = 'essensbestellung-sso';
export const DEFAULT_FIC_AUDIENCE = 'api://AzureADTokenExchange';
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KEY_FILE = path.join(dataDir, 'sso-signing-key.json');
let keyCache = null;

// RSA-Schlüsselpaar für Client-Assertions (einmalig erzeugt, lokal abgelegt).
export function getSsoKeys() {
  if (keyCache) return keyCache;
  if (fs.existsSync(KEY_FILE)) {
    keyCache = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    return keyCache;
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = crypto.randomBytes(8).toString('hex');
  keyCache = {
    kid,
    publicJwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' },
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
  fs.writeFileSync(KEY_FILE, JSON.stringify(keyCache), { mode: 0o600 });
  return keyCache;
}

// Konfiguration: Datenbank (Admin-Bereich) hat Vorrang, Umgebungsvariablen
// dienen als Fallback für bestehende Installationen.
export function getSsoConfig() {
  const clientId = getSetting('sso_client_id', '') || process.env.ENTRA_CLIENT_ID || '';
  const tenantId = getSetting('sso_tenant_id', '') || process.env.ENTRA_TENANT_ID || '';
  const enabledSetting = getSetting('sso_enabled', '');
  // Ohne explizite Einstellung gilt: aktiviert, wenn per Env konfiguriert
  // (Verhalten bisheriger Installationen bleibt erhalten).
  const enabled =
    enabledSetting === '' ? Boolean(process.env.ENTRA_CLIENT_ID && process.env.ENTRA_TENANT_ID) : enabledSetting === '1';
  return {
    enabled: enabled && GUID_RE.test(clientId) && GUID_RE.test(tenantId),
    clientId,
    tenantId,
    autoRedirect: getSetting('sso_auto_redirect', '0') === '1',
    ficIssuer: (getSetting('sso_fic_issuer', '') || '').replace(/\/$/, ''),
    ficSubject: getSetting('sso_fic_subject', '') || DEFAULT_FIC_SUBJECT,
    ficAudience: getSetting('sso_fic_audience', '') || DEFAULT_FIC_AUDIENCE,
    source: getSetting('sso_client_id', '') ? 'db' : process.env.ENTRA_CLIENT_ID ? 'env' : 'none',
  };
}

export function saveSsoSettings(values) {
  for (const [key, settingKey] of [
    ['clientId', 'sso_client_id'],
    ['tenantId', 'sso_tenant_id'],
    ['ficIssuer', 'sso_fic_issuer'],
    ['ficSubject', 'sso_fic_subject'],
    ['ficAudience', 'sso_fic_audience'],
  ]) {
    if (values[key] !== undefined) setSetting(settingKey, String(values[key]).trim());
  }
  if (values.enabled !== undefined) setSetting('sso_enabled', values.enabled ? '1' : '0');
  if (values.autoRedirect !== undefined) setSetting('sso_auto_redirect', values.autoRedirect ? '1' : '0');
}

// Issuer-URL prüfen: öffentlich erreichbares HTTPS (http nur für lokale Tests).
export function validateIssuerUrl(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return 'Die Issuer-URL ist keine gültige URL.';
  }
  const isLocal = u.hostname === 'localhost' || /^127\./.test(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal)) {
    return 'Die Issuer-URL muss mit https:// beginnen (Entra ID ruft sie zur Signaturprüfung ab).';
  }
  return null;
}

// Client-Assertion für die Verbundanmeldeinformation: iss/sub/aud müssen
// exakt den in Azure hinterlegten FIC-Werten entsprechen; Entra prüft die
// Signatur über die JWKS des Issuers.
export function buildClientAssertion(cfg) {
  const { kid, privatePem } = getSsoKeys();
  return jwt.sign({ jti: crypto.randomUUID() }, privatePem, {
    algorithm: 'RS256',
    keyid: kid,
    issuer: cfg.ficIssuer,
    subject: cfg.ficSubject,
    audience: cfg.ficAudience,
    expiresIn: '5m',
  });
}

export function loginBase() {
  return (process.env.ENTRA_LOGIN_BASE || 'https://login.microsoftonline.com').replace(/\/$/, '');
}

// Vollständiger Verbindungstest: holt per client_credentials + Client-
// Assertion ein echtes Token von Entra ID. Erfolg beweist, dass Client-ID,
// Tenant-ID und die Verbundanmeldeinformation (Issuer/Subject/Audience,
// erreichbare JWKS) korrekt eingerichtet sind.
export async function testSsoConnection() {
  const cfg = getSsoConfig();
  const problems = [];
  if (!GUID_RE.test(cfg.clientId)) problems.push('Client-ID fehlt oder ist keine gültige GUID.');
  if (!GUID_RE.test(cfg.tenantId)) problems.push('Tenant-ID fehlt oder ist keine gültige GUID.');
  if (!cfg.ficIssuer) {
    problems.push('Issuer-URL der Verbundanmeldeinformation fehlt (Basis-URL des Portals eintragen).');
  } else {
    const issuerError = validateIssuerUrl(cfg.ficIssuer);
    if (issuerError) problems.push(issuerError);
  }
  if (problems.length > 0) return { ok: false, stage: 'konfiguration', message: problems.join(' ') };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let res;
    try {
      res = await fetch(`${loginBase()}/${cfg.tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          tenant: cfg.tenantId,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          client_assertion: buildClientAssertion(cfg),
        }),
        signal: controller.signal,
      });
    } catch (e) {
      const reason = e?.name === 'AbortError' ? 'Zeitüberschreitung' : e?.cause?.code || e?.message;
      return {
        ok: false,
        stage: 'netzwerk',
        message: `Entra ID ist vom Server aus nicht erreichbar (${reason}). Bitte ausgehenden Internetzugang prüfen.`,
      };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* keine JSON-Antwort */
    }
    if (res.ok && data?.access_token) {
      return {
        ok: true,
        message: `Token erfolgreich von Entra ID erhalten (gültig ${Math.round((data.expires_in || 3600) / 60)} Minuten). Client-ID, Tenant-ID und Verbundanmeldeinformation sind korrekt eingerichtet.`,
      };
    }
    return {
      ok: false,
      stage: 'entra',
      message: `Entra ID hat die Anmeldung abgelehnt (HTTP ${res.status}): ${
        data?.error_description || data?.error || 'unbekannter Fehler'
      }`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// OIDC-Discovery-Dokument des Portals (von Entra ID zur FIC-Prüfung abgerufen).
export function discoveryDocument(cfg) {
  const issuer = cfg.ficIssuer;
  if (!issuer) return null;
  return {
    issuer,
    jwks_uri: `${issuer}/api/sso/jwks`,
    response_types_supported: ['id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  };
}
