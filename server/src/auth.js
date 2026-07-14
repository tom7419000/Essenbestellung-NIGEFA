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
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
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
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Nur für Administratoren.' });
  }
  next();
}
