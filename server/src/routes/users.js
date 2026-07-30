import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import {
  bumpTokenVersion,
  passwordError,
  requireAuth,
  requireAdmin,
  requirePlanner,
  sanitizeUser,
} from '../auth.js';
import { auditLog } from '../audit.js';

const router = Router();

// Nach außen gibt es drei Rollen: user, planung, admin. Intern ist „planung"
// ein normaler Benutzer mit gesetztem can_plan-Flag.
function roleToColumns(role) {
  if (role === 'admin') return { role: 'admin', canPlan: 0 };
  if (role === 'planung') return { role: 'user', canPlan: 1 };
  return { role: 'user', canPlan: 0 };
}

// Auswahlliste möglicher Organisatoren – wird auch von Planern (nicht nur
// Admins) für die Tagesplanung benötigt. Liefert nur unkritische Felder.
router.get('/selectable', requireAuth, requirePlanner, (req, res) => {
  const users = db
    .prepare(
      `SELECT id, display_name FROM users
       WHERE is_active = 1 AND is_blocked = 0
       ORDER BY display_name COLLATE NOCASE`
    )
    .all();
  res.json({ users: users.map((u) => ({ id: u.id, displayName: u.display_name })) });
});

// Ab hier: nur Administratoren (Benutzerverwaltung).
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
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ message: pwErr });
  const cols = roleToColumns(role);
  try {
    const info = db
      .prepare(
        'INSERT INTO users (username, display_name, password_hash, role, can_plan) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        String(username).trim(),
        String(displayName).trim(),
        bcrypt.hashSync(String(password), 10),
        cols.role,
        cols.canPlan
      );
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    auditLog('user_created', req, {
      targetId: user.id,
      targetUsername: user.username,
      role: user.role,
      canPlan: !!user.can_plan,
    });
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
  if (password !== undefined && password !== '') {
    const pwErr = passwordError(password);
    if (pwErr) return res.status(400).json({ message: pwErr });
  }
  const cols =
    role === undefined
      ? { role: user.role, canPlan: user.can_plan }
      : roleToColumns(role);
  const newRole = cols.role;
  const newCanPlan = cols.canPlan ? 1 : 0;
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

  db.prepare(
    'UPDATE users SET display_name = ?, role = ?, can_plan = ?, is_active = ? WHERE id = ?'
  ).run(newName, newRole, newCanPlan, newActive, user.id);
  if (password) {
    // Passwort-Reset durch Admin macht bestehende Sitzungen des Nutzers ungültig.
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(String(password), 10),
      user.id
    );
    bumpTokenVersion(user.id);
  }
  auditLog('user_updated', req, {
    targetId: user.id,
    targetUsername: user.username,
    roleChanged: newRole !== user.role || newCanPlan !== (user.can_plan ? 1 : 0),
    activeChanged: newActive !== user.is_active,
    passwordReset: Boolean(password),
  });
  res.json({ user: sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
});

// Konto sperren/entsperren. Beim Sperren wird zusätzlich die Token-Version
// hochgezählt: bereits ausgestellte Tokens sind damit endgültig unbrauchbar
// und werden auch durch ein späteres Entsperren nicht wieder gültig.
router.patch('/:id/blocked', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
  if (user.id === req.user.id) {
    return res.status(400).json({ message: 'Du kannst dich nicht selbst sperren.' });
  }
  const blocked = req.body?.blocked ? 1 : 0;
  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked, user.id);
  if (blocked) bumpTokenVersion(user.id);
  auditLog(blocked ? 'user_blocked' : 'user_unblocked', req, {
    targetId: user.id,
    targetUsername: user.username,
  });
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
  auditLog('user_deleted', req, { targetId: user.id, targetUsername: user.username });
  res.json({ ok: true });
});

export default router;
