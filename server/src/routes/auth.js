import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, sanitizeUser, signToken } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Bitte Benutzername und Passwort angeben.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ message: 'Ungültige Zugangsdaten.' });
  }
  if (!user.is_active) {
    return res.status(403).json({ message: 'Dieses Konto ist deaktiviert.' });
  }
  res.json({ token: signToken(user), user: sanitizeUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Neues Passwort: mindestens 6 Zeichen.' });
  }
  if (!bcrypt.compareSync(String(oldPassword || ''), req.user.password_hash)) {
    return res.status(400).json({ message: 'Das aktuelle Passwort ist falsch.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    req.user.id
  );
  res.json({ ok: true });
});

export default router;
