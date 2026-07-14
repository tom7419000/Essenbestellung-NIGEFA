import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimaler .env-Loader ohne Zusatzabhängigkeit: lädt server/.env, falls
// vorhanden. Bereits gesetzte Umgebungsvariablen haben Vorrang. Muss als
// erstes Modul importiert werden, bevor andere Module process.env lesen.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(__dirname, '../.env');

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (key in process.env) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}
