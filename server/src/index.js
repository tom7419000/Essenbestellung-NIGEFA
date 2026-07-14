import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { initDb } from './db.js';
import { resolveOpenDays } from './dayLogic.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { restaurantsRouter, menuItemsRouter } from './routes/restaurants.js';
import { daysRouter, ordersRouter } from './routes/days.js';
import myRouter from './routes/my.js';
import settingsRouter from './routes/settings.js';
import brandingRouter, { faviconAlias } from './routes/branding.js';
import menuImportRouter from './routes/menuImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

initDb();

// Phasenwechsel finden auch ohne Benutzer-Traffic statt.
resolveOpenDays();
setInterval(resolveOpenDays, 30_000);

const app = express();
app.use(express.json());

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

app.use('/api', (req, res) => res.status(404).json({ message: 'Nicht gefunden.' }));

// Hochgeladenes Favicon auch unter dem klassischen Pfad bereitstellen.
app.get('/favicon.ico', faviconAlias);

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

app.listen(PORT, () => {
  console.log(`Essensbestellung-Server läuft auf http://localhost:${PORT}`);
});
