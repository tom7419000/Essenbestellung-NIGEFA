import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { db, dataDir } from './db.js';

// Secret aus der Umgebung oder einmalig generiert und lokal abgelegt,
// damit Logins einen Server-Neustart überleben.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.jwt-secret');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(file, 'utf8').trim();
}

export const JWT_SECRET = loadSecret();
export const TOKEN_TTL = '12h';

export function signToken(user) {
  // tv = token_version: erlaubt serverseitige Invalidierung (Logout,
  // Passwortänderung, Deaktivierung) durch Hochzählen in der Datenbank.
  return jwt.sign({ sub: user.id, tv: user.token_version ?? 0 }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

export const MIN_PASSWORD_LENGTH = 8;

// Einheitliche Passwort-Policy (N1). Leerer Rückgabewert = gültig.
export function passwordError(pw) {
  if (!pw || String(pw).length < MIN_PASSWORD_LENGTH) {
    return `Passwort: mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  }
  return null;
}

export function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    isActive: !!u.is_active,
  };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Nicht angemeldet.' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Sitzung abgelaufen. Bitte neu anmelden.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Konto nicht gefunden oder deaktiviert.' });
  }
  // Token-Version muss zum aktuellen Stand passen (M2): nach Logout,
  // Passwortänderung oder Deaktivierung sind alte Tokens ungültig.
  if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
    return res.status(401).json({ message: 'Sitzung abgelaufen. Bitte neu anmelden.' });
  }
  req.user = user;
  next();
}

// Alle Sitzungen eines Benutzers ungültig machen (Token-Version hochzählen).
export function bumpTokenVersion(userId) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Nur für Administratoren.' });
  }
  next();
}
