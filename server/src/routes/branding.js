import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { dataDir, getSetting, setSetting } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const brandingDir = path.join(dataDir, 'branding');
fs.mkdirSync(brandingDir, { recursive: true });

export const DEFAULT_COLORS = {
  primary: '#e8590c',
  secondary: '#1971c2',
  accent: '#2f9e44',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Erlaubte Formate je Upload-Ziel (Content-Type -> Dateiendung)
const LOGO_TYPES = {
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
const FAVICON_TYPES = {
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};
const CONTENT_TYPE_BY_EXT = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// Prüft, ob der Dateiinhalt zum angegebenen Content-Type passt (Magic Bytes).
function looksLikeImage(buf, contentType) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false;
  switch (contentType) {
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/webp':
      return buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00;
    case 'image/svg+xml': {
      const head = buf.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
      if (!head.startsWith('<?xml') && !head.startsWith('<svg') && !head.startsWith('<!doctype svg')) {
        return false;
      }
      // Sicherheitsnetz: SVGs mit Skripten oder Event-Handlern ablehnen.
      const full = buf.toString('utf8').toLowerCase();
      return !/<script|javascript:|on\w+\s*=/.test(full);
    }
    default:
      return false;
  }
}

function bumpVersion() {
  setSetting('branding_version', String(Date.now()));
}

function fileUrl(kind) {
  const file = getSetting(`branding_${kind}_file`);
  if (!file) return null;
  return `/api/branding/${kind}?v=${getSetting('branding_version', '0')}`;
}

export function currentBranding() {
  return {
    colors: {
      primary: getSetting('branding_color_primary', DEFAULT_COLORS.primary),
      secondary: getSetting('branding_color_secondary', DEFAULT_COLORS.secondary),
      accent: getSetting('branding_color_accent', DEFAULT_COLORS.accent),
    },
    logoUrl: fileUrl('logo'),
    faviconUrl: fileUrl('favicon'),
  };
}

function sendBrandingFile(kind, req, res) {
  const file = getSetting(`branding_${kind}_file`);
  const filePath = file ? path.join(brandingDir, file) : null;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Keine Datei hinterlegt.' });
  }
  res.set('Content-Type', CONTENT_TYPE_BY_EXT[path.extname(file)] || 'application/octet-stream');
  // Versionierte URL (?v=...) erlaubt aggressives Caching.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.sendFile(filePath);
}

// Für Browser, die hart /favicon.ico anfragen (wird in index.js eingebunden).
export function faviconAlias(req, res, next) {
  const file = getSetting('branding_favicon_file');
  if (!file) return next();
  sendBrandingFile('favicon', req, res);
}

function makeUploadHandler(kind, allowedTypes, maxBytes) {
  const parseRaw = express.raw({ type: () => true, limit: maxBytes });
  return [
    requireAuth,
    requireAdmin,
    parseRaw,
    (req, res) => {
      const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = allowedTypes[contentType];
      if (!ext) {
        const allowed = [...new Set(Object.values(allowedTypes))].join(', ').replaceAll('.', '').toUpperCase();
        return res.status(415).json({ message: `Ungültiges Dateiformat. Erlaubt: ${allowed}.` });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ message: 'Keine Datei übermittelt.' });
      }
      if (!looksLikeImage(req.body, contentType)) {
        return res.status(400).json({ message: 'Der Dateiinhalt passt nicht zum angegebenen Format.' });
      }
      // Alte Datei entfernen (Endung kann sich ändern), neue schreiben.
      const previous = getSetting(`branding_${kind}_file`);
      if (previous) fs.rmSync(path.join(brandingDir, previous), { force: true });
      const filename = `${kind}${ext}`;
      fs.writeFileSync(path.join(brandingDir, filename), req.body);
      setSetting(`branding_${kind}_file`, filename);
      bumpVersion();
      res.json(currentBranding());
    },
  ];
}

function makeDeleteHandler(kind) {
  return [
    requireAuth,
    requireAdmin,
    (req, res) => {
      const file = getSetting(`branding_${kind}_file`);
      if (file) {
        fs.rmSync(path.join(brandingDir, file), { force: true });
        setSetting(`branding_${kind}_file`, '');
      }
      bumpVersion();
      res.json(currentBranding());
    },
  ];
}

const router = Router();

// Öffentlich: wird vor dem Login benötigt (Login-Seite zeigt Logo/Farben).
router.get('/', (req, res) => res.json(currentBranding()));
router.get('/logo', (req, res) => sendBrandingFile('logo', req, res));
router.get('/favicon', (req, res) => sendBrandingFile('favicon', req, res));

router.put('/colors', requireAuth, requireAdmin, (req, res) => {
  const { primary, secondary, accent } = req.body || {};
  for (const [name, value] of [['Primär', primary], ['Sekundär', secondary], ['Akzent', accent]]) {
    if (!HEX_COLOR.test(String(value || ''))) {
      return res.status(400).json({ message: `${name}farbe: bitte einen Hex-Wert wie #e8590c angeben.` });
    }
  }
  setSetting('branding_color_primary', primary.toLowerCase());
  setSetting('branding_color_secondary', secondary.toLowerCase());
  setSetting('branding_color_accent', accent.toLowerCase());
  res.json(currentBranding());
});

router.post('/logo', ...makeUploadHandler('logo', LOGO_TYPES, 1024 * 1024));
router.post('/favicon', ...makeUploadHandler('favicon', FAVICON_TYPES, 512 * 1024));
router.delete('/logo', ...makeDeleteHandler('logo'));
router.delete('/favicon', ...makeDeleteHandler('favicon'));

export default router;
