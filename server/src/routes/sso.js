import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  DEFAULT_FIC_AUDIENCE,
  DEFAULT_FIC_SUBJECT,
  GUID_RE,
  discoveryDocument,
  getSsoConfig,
  getSsoKeys,
  saveSsoSettings,
  testSsoConnection,
  validateIssuerUrl,
} from '../sso.js';

const router = Router();

// Öffentlich: Laufzeit-Konfiguration für das Frontend (Login-Seite).
// Client-/Tenant-ID sind keine Geheimnisse; sie stehen auch im Login-Redirect.
router.get('/config', (req, res) => {
  const cfg = getSsoConfig();
  if (!cfg.enabled) return res.json({ enabled: false });
  res.json({
    enabled: true,
    clientId: cfg.clientId,
    tenantId: cfg.tenantId,
    autoRedirect: cfg.autoRedirect,
  });
});

// Öffentlich: JWKS des Portals – Entra ID prüft darüber die Signatur der
// Client-Assertions (Verbundanmeldeinformation).
router.get('/jwks', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ keys: [getSsoKeys().publicJwk] });
});

// ---------- Admin ----------

router.get('/settings', requireAuth, requireAdmin, (req, res) => {
  const cfg = getSsoConfig();
  res.json({
    ...cfg,
    defaults: { ficSubject: DEFAULT_FIC_SUBJECT, ficAudience: DEFAULT_FIC_AUDIENCE },
  });
});

router.put('/settings', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const clientId = String(body.clientId ?? '').trim();
  const tenantId = String(body.tenantId ?? '').trim();
  const ficIssuer = String(body.ficIssuer ?? '').trim().replace(/\/$/, '');

  if (clientId && !GUID_RE.test(clientId)) {
    return res.status(400).json({ message: 'Client-ID: bitte eine GUID im Format 00000000-0000-0000-0000-000000000000 angeben.' });
  }
  if (tenantId && !GUID_RE.test(tenantId)) {
    return res.status(400).json({ message: 'Tenant-ID: bitte eine GUID im Format 00000000-0000-0000-0000-000000000000 angeben.' });
  }
  const issuerError = validateIssuerUrl(ficIssuer);
  if (issuerError) return res.status(400).json({ message: issuerError });
  if (body.enabled && !(clientId || process.env.ENTRA_CLIENT_ID) ) {
    return res.status(400).json({ message: 'SSO kann erst aktiviert werden, wenn Client-ID und Tenant-ID hinterlegt sind.' });
  }
  if (body.enabled && !(tenantId || process.env.ENTRA_TENANT_ID)) {
    return res.status(400).json({ message: 'SSO kann erst aktiviert werden, wenn Client-ID und Tenant-ID hinterlegt sind.' });
  }

  saveSsoSettings({
    enabled: Boolean(body.enabled),
    autoRedirect: Boolean(body.autoRedirect),
    clientId,
    tenantId,
    ficIssuer,
    ficSubject: String(body.ficSubject ?? '').trim(),
    ficAudience: String(body.ficAudience ?? '').trim(),
  });
  const cfg = getSsoConfig();
  res.json({ ...cfg, defaults: { ficSubject: DEFAULT_FIC_SUBJECT, ficAudience: DEFAULT_FIC_AUDIENCE } });
});

// Verbindungstest: holt mit den hinterlegten Werten ein echtes Token von
// Entra ID (client_credentials + Client-Assertion der Verbundanmeldung).
router.post('/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await testSsoConnection());
  } catch (e) {
    console.error('SSO-Verbindungstest fehlgeschlagen:', e);
    res.status(500).json({ ok: false, message: 'Unerwarteter Fehler beim Verbindungstest.' });
  }
});

// OIDC-Discovery unter /.well-known/openid-configuration (in index.js gemountet).
export function wellKnownHandler(req, res) {
  const doc = discoveryDocument(getSsoConfig());
  if (!doc) {
    return res
      .status(404)
      .json({ message: 'Keine Issuer-URL konfiguriert (Admin → Anmeldung (SSO)).' });
  }
  res.set('Cache-Control', 'public, max-age=300');
  res.json(doc);
}

export default router;
