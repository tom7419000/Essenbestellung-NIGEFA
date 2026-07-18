import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { bumpTokenVersion, passwordError, requireAuth, sanitizeUser, signToken } from '../auth.js';
import { getSsoConfig } from '../sso.js';
import { rateLimit } from '../rateLimit.js';
import { auditLog } from '../audit.js';

const router = Router();

// Brute-Force-Schutz (H3): pro Client-IP begrenzt.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.',
});
const ssoLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Bitte Benutzername und Passwort angeben.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    auditLog('login_failed', req, { username: String(username).trim().slice(0, 64) });
    return res.status(401).json({ message: 'Ungültige Zugangsdaten.' });
  }
  if (!user.is_active) {
    // Einheitliche Antwort (N2): nicht verraten, dass Benutzer/Passwort
    // korrekt waren, das Konto aber deaktiviert ist. Server-Log dokumentiert
    // den Grund weiterhin.
    auditLog('login_denied_inactive', req, { userId: user.id, username: user.username });
    return res.status(401).json({ message: 'Ungültige Zugangsdaten.' });
  }
  auditLog('login_success', req, { userId: user.id, username: user.username });
  res.json({ token: signToken(user), user: sanitizeUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// Abmelden: macht alle Sitzungen dieses Benutzers ungültig (M2). Ein danach
// noch vorhandenes/gestohlenes Token ist damit serverseitig unbrauchbar.
router.post('/logout', requireAuth, (req, res) => {
  bumpTokenVersion(req.user.id);
  auditLog('logout', req);
  res.json({ ok: true });
});

// ---------- Single Sign-On über Microsoft Entra ID ----------
// Der Client meldet sich per MSAL bei Entra ID an und schickt das ID-Token
// hierher. Der Server prüft Signatur (JWKS), Audience, Issuer und Ablauf,
// ordnet den Benutzer über die E-Mail-Adresse zu (Benutzername = E-Mail)
// und stellt das normale App-JWT aus. Rollen werden weiterhin lokal gepflegt.

let jwksCache = { url: '', keys: [], fetchedAt: 0 };

async function entraPublicKey(kid, tenantId) {
  const url =
    process.env.ENTRA_JWKS_URL ||
    `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const stale = jwksCache.url !== url || Date.now() - jwksCache.fetchedAt > 60 * 60 * 1000;
  if (stale || !jwksCache.keys.some((k) => k.kid === kid)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`JWKS-Abruf fehlgeschlagen (${response.status})`);
    jwksCache = { url, keys: (await response.json()).keys || [], fetchedAt: Date.now() };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error('Signaturschlüssel nicht gefunden.');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

router.post('/sso', ssoLimiter, async (req, res) => {
  try {
    // Konfiguration aus dem Admin-Bereich (DB) mit Env-Fallback.
    const { enabled, clientId, tenantId } = getSsoConfig();
    if (!enabled) {
      return res.status(503).json({ message: 'SSO ist deaktiviert oder nicht konfiguriert.' });
    }

    const idToken = String(req.body?.idToken || '');
    if (!idToken) return res.status(400).json({ message: 'Kein Token übermittelt.' });
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded?.header?.kid) return res.status(400).json({ message: 'Ungültiges Token.' });

    const key = await entraPublicKey(decoded.header.kid, tenantId);
    let claims;
    try {
      claims = jwt.verify(idToken, key, {
        algorithms: ['RS256'],
        audience: clientId,
        issuer:
          process.env.ENTRA_ISSUER || `https://login.microsoftonline.com/${tenantId}/v2.0`,
      });
    } catch {
      return res
        .status(401)
        .json({ message: 'SSO-Anmeldung fehlgeschlagen: Token ungültig oder abgelaufen.' });
    }

    const email = String(claims.preferred_username || claims.email || '')
      .trim()
      .toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Das Token enthält keine E-Mail-Adresse.' });
    }

    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(email);
    if (!user) {
      if (process.env.ENTRA_AUTO_CREATE === '0') {
        return res.status(403).json({
          message: 'Für diese E-Mail-Adresse existiert kein Konto. Bitte an den Administrator wenden.',
        });
      }
      // Lokales Passwort ist zufällig und damit unbenutzbar – Anmeldung nur per SSO.
      const info = db
        .prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(
          email,
          String(claims.name || email).trim(),
          bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10),
          'user'
        );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }
    if (!user.is_active) {
      return res.status(403).json({ message: 'Dieses Konto ist deaktiviert.' });
    }
    auditLog('sso_login', req, { userId: user.id, username: user.username });
    res.json({ token: signToken(user), user: sanitizeUser(user) });
  } catch (e) {
    console.error('SSO-Fehler:', e);
    res.status(502).json({ message: 'SSO-Anmeldung derzeit nicht möglich.' });
  }
});

router.post('/change-password', passwordLimiter, requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const pwErr = passwordError(newPassword);
  if (pwErr) return res.status(400).json({ message: `Neues ${pwErr}` });
  if (!bcrypt.compareSync(String(oldPassword || ''), req.user.password_hash)) {
    return res.status(400).json({ message: 'Das aktuelle Passwort ist falsch.' });
  }
  // Passwortänderung macht alte Tokens ungültig; die aktuelle Sitzung erhält
  // ein frisches Token, damit sie nicht abgemeldet wird.
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    req.user.id
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, token: signToken(updated) });
});

export default router;
