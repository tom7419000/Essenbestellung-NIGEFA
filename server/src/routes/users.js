import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireAdmin, sanitizeUser } from '../auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY display_name COLLATE NOCASE').all();
  res.json({ users: users.map(sanitizeUser) });
});

router.post('/', (req, res) => {
  const { username, displayName, password, role } = req.body || {};
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(String(username || ''))) {
    return res.status(400).json({ message: 'Benutzername: 3–32 Zeichen (Buchstaben, Zahlen, . _ -).' });
  }
  if (!displayName || !String(displayName).trim()) {
    return res.status(400).json({ message: 'Bitte einen Anzeigenamen angeben.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ message: 'Passwort: mindestens 6 Zeichen.' });
  }
  try {
    const info = db
      .prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(
        String(username).trim(),
        String(displayName).trim(),
        bcrypt.hashSync(String(password), 10),
        role === 'admin' ? 'admin' : 'user'
      );
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ user: sanitizeUser(user) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'Dieser Benutzername ist bereits vergeben.' });
    }
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });

  const { displayName, role, isActive, password } = req.body || {};
  if (password !== undefined && password !== '' && String(password).length < 6) {
    return res.status(400).json({ message: 'Passwort: mindestens 6 Zeichen.' });
  }
  const newRole = role === undefined ? user.role : role === 'admin' ? 'admin' : 'user';
  const newActive = isActive === undefined ? user.is_active : isActive ? 1 : 0;
  if (user.id === req.user.id && (newRole !== 'admin' || !newActive)) {
    return res
      .status(400)
      .json({ message: 'Du kannst dein eigenes Admin-Konto nicht herabstufen oder deaktivieren.' });
  }
  const newName =
    displayName !== undefined && String(displayName).trim()
      ? String(displayName).trim()
      : user.display_name;

  db.prepare('UPDATE users SET display_name = ?, role = ?, is_active = ? WHERE id = ?').run(
    newName,
    newRole,
    newActive,
    user.id
  );
  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(String(password), 10),
      user.id
    );
  }
  res.json({ user: sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
});

router.delete('/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
  if (user.id === req.user.id) {
    return res.status(400).json({ message: 'Du kannst dich nicht selbst löschen.' });
  }
  // Stimmen und Bestellungen des Benutzers werden mitgelöscht (ON DELETE CASCADE).
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

export default router;
