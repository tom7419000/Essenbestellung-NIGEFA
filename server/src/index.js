import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { initDb } from './db.js';
import { resolveOpenDays } from './dayLogic.js';
import { generateAutoPlan } from './autoPlan.js';
import { initPush } from './push.js';
import { securityHeaders } from './security.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { restaurantsRouter, menuItemsRouter } from './routes/restaurants.js';
import { daysRouter, ordersRouter } from './routes/days.js';
import myRouter from './routes/my.js';
import settingsRouter from './routes/settings.js';
import brandingRouter, { faviconAlias } from './routes/branding.js';
import menuImportRouter from './routes/menuImport.js';
import ssoRouter, { wellKnownHandler } from './routes/sso.js';
import pushRouter from './routes/push.js';
import statsRouter from './routes/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PORT roh übernehmen (nicht per Number() erzwingen): Phusion Passenger –
// die Engine hinter Plesks Node.js-Erweiterung – kann statt einer Portnummer
// den Pfad eines Unix-Sockets in process.env.PORT übergeben. Node.js'
// listen() akzeptiert beides (Portnummer als String oder Socket-Pfad).
const PORT = process.env.PORT || 3001;

initDb();

// Web-Push initialisieren (lädt VAPID-Schlüssel bzw. erzeugt sie einmalig).
initPush();

// Phasenwechsel finden auch ohne Benutzer-Traffic statt.
resolveOpenDays();
setInterval(resolveOpenDays, 30_000);

// Automatische Tagesplanung (Mo–Fr) idempotent nachziehen: beim Start und
// danach regelmäßig. Bestehende Tage werden nie überschrieben.
function runAutoPlan() {
  try {
    const r = generateAutoPlan();
    if (r.created.length) {
      console.log(`[auto-plan] ${r.created.length} Tag(e) erzeugt: ${r.created.join(', ')}`);
    }
  } catch (e) {
    console.error('[auto-plan] Fehler bei der automatischen Tagesplanung:', e.message);
  }
}
runAutoPlan();
setInterval(runAutoPlan, 6 * 60 * 60 * 1000);

const app = express();

// Hinter einem Reverse-Proxy die X-Forwarded-*-Header berücksichtigen
// (für HTTPS-Erkennung und korrekte Client-IP beim Rate-Limiting).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// Sicherheits-Header für alle Antworten (inkl. Fehlerseiten und statischem Frontend).
app.use(securityHeaders);

// Explizites Body-Limit (N3): begrenzt JSON-Requests und deckt zugleich den
// CSV-Import (bis 512 KB) ab. Datei-Uploads laufen über eigene raw-Parser
// mit eigenen Limits (branding.js).
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/restaurants', restaurantsRouter);
app.use('/api/menu-items', menuItemsRouter);
app.use('/api/days', daysRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/my', myRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/branding', brandingRouter);
app.use('/api/menu-import', menuImportRouter);
app.use('/api/sso', ssoRouter);
app.use('/api/push', pushRouter);
app.use('/api/stats', statsRouter);

app.use('/api', (req, res) => res.status(404).json({ message: 'Nicht gefunden.' }));

// Hochgeladenes Favicon auch unter dem klassischen Pfad bereitstellen.
app.get('/favicon.ico', faviconAlias);

// OIDC-Discovery für die Verbundanmeldeinformation (Entra ID ruft dieses
// Dokument samt JWKS ab, um Client-Assertions des Portals zu prüfen).
app.get('/.well-known/openid-configuration', wellKnownHandler);

// Produktionsmodus: gebautes Frontend aus client/dist ausliefern.
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(path.join(dist, 'index.html'));
    }
    next();
  });
}

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Ungültige Anfrage.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Die Datei ist zu groß.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Interner Serverfehler.' });
});

// Unter Phusion Passenger (Plesk) fängt die Engine listen() ab und verbindet
// die App mit ihrem eigenen Socket – der übergebene Wert ist dann zweitrangig.
app.listen(PORT, () => {
  console.log(`Essensbestellung-Server läuft (Port/Socket: ${PORT}).`);
});
