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

// Effektive Rolle nach außen: Administratoren haben alle Rechte; die
// Berechtigung „Planung" (can_plan) erscheint als eigene Rolle, ist intern
// aber ein additives Flag auf einem normalen Benutzerkonto.
export function effectiveRole(u) {
  if (u.role === 'admin') return 'admin';
  if (u.can_plan) return 'planung';
  return 'user';
}

export function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: effectiveRole(u),
    canPlan: !!u.can_plan,
    isActive: !!u.is_active,
    isBlocked: !!u.is_blocked,
  };
}

// Einheitliche Antwort für gesperrte Konten. `blocked: true` erlaubt dem
// Client, die Hinweisseite zu zeigen, statt nur eine Fehlermeldung.
export const BLOCKED_STATUS = 403;
export function blockedResponse(res) {
  return res.status(BLOCKED_STATUS).json({ message: 'Du bist gesperrt.', blocked: true });
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
  // Sperre vor der Token-Prüfung: beim Sperren wird die Token-Version
  // hochgezählt, sonst käme hier nur „Sitzung abgelaufen" statt des Hinweises.
  // Die Prüfung läuft bei jedem Request gegen die Datenbank – eine Sperre
  // wirkt damit sofort, auch für bereits ausgestellte Tokens.
  if (user.is_blocked) return blockedResponse(res);
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

// Tagesplanung: erlaubt für Administratoren und Konten mit der Berechtigung
// „Planung" (can_plan). Deckt ausschließlich die Planungsfunktionen ab –
// Benutzer-, Restaurant-, Branding- und SSO-Verwaltung bleiben Admin-only.
export function requirePlanner(req, res, next) {
  if (req.user.role !== 'admin' && !req.user.can_plan) {
    return res.status(403).json({ message: 'Nur für Planung oder Administratoren.' });
  }
  next();
}
