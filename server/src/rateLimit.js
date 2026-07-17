// Einfaches In-Memory-Rate-Limiting (Audit H3), abhängigkeitsfrei.
// Fixed-Window je Client-IP. Passend zum Single-Instance-Betrieb (SQLite,
// ein Prozess); hinter mehreren Instanzen müsste ein geteilter Speicher her.

export function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // key -> { count, resetAt }

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  cleanup.unref?.();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    // req.ip berücksichtigt 'trust proxy' (X-Forwarded-For hinter Reverse-Proxy).
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retrySec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retrySec));
      return res.status(429).json({
        message: message || 'Zu viele Anfragen. Bitte etwas später erneut versuchen.',
      });
    }
    next();
  };
}
