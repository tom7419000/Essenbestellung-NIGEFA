import './env.js';
import bcrypt from 'bcryptjs';
import { db, initDb } from './db.js';
import { passwordError } from './auth.js';

// Produktions-Bootstrap: legt einen Administrator an (oder setzt dessen
// Passwort/Rolle zurück) – OHNE Demo-Daten (im Gegensatz zu seed.js).
// Aufruf:
//   node src/createAdmin.js <benutzername> <passwort> [anzeigename]
// oder über Umgebungsvariablen ADMIN_USER / ADMIN_PASSWORD / ADMIN_DISPLAY_NAME.

initDb();

const username = process.argv[2] || process.env.ADMIN_USER || 'admin';
const password = process.argv[3] || process.env.ADMIN_PASSWORD;
const displayName = process.argv[4] || process.env.ADMIN_DISPLAY_NAME || username;

if (!password) {
  console.error('Fehler: kein Passwort angegeben.');
  console.error('Aufruf: node src/createAdmin.js <benutzername> <passwort> [anzeigename]');
  console.error('   oder: ADMIN_USER=… ADMIN_PASSWORD=… node src/createAdmin.js');
  process.exit(1);
}
if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
  console.error('Fehler: Benutzername muss 3–32 Zeichen lang sein (Buchstaben, Zahlen, . _ -).');
  process.exit(1);
}
const pwErr = passwordError(password);
if (pwErr) {
  console.error(`Fehler: ${pwErr}`);
  process.exit(1);
}

const hash = bcrypt.hashSync(String(password), 10);
const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
if (existing) {
  db.prepare(
    "UPDATE users SET password_hash = ?, role = 'admin', is_active = 1, token_version = token_version + 1 WHERE id = ?"
  ).run(hash, existing.id);
  console.log(`Administrator „${username}" aktualisiert (Passwort gesetzt, Rolle admin, aktiv).`);
} else {
  db.prepare(
    "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run(username, String(displayName).trim() || username, hash);
  console.log(`Administrator „${username}" angelegt.`);
}
process.exit(0);
