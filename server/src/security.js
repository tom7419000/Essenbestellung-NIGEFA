// Sicherheits-HTTP-Header für alle Antworten (Audit H2/M3).
// Bewusst abhängigkeitsfrei gehalten (wie der Rest des Projekts).
//
// Die Content-Security-Policy ist auf die SPA zugeschnitten:
// - script-src 'self': keine Inline-Skripte (der Theme-Init liegt als
//   externe Datei /theme-init.js vor)
// - style-src 'unsafe-inline': React setzt Inline-style-Attribute und der
//   BrandingContext schreibt CSS-Variablen (deutlich geringeres Risiko als
//   Inline-Skripte)
// - connect-/frame-src erlauben zusätzlich login.microsoftonline.com, damit
//   der MSAL-/Entra-ID-Login funktioniert
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' https://login.microsoftonline.com",
  "frame-src 'self' https://login.microsoftonline.com",
  "form-action 'self'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.set('Content-Security-Policy', CSP);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Permitted-Cross-Domain-Policies', 'none');

  // HSTS nur über gesicherte Verbindungen senden (M3). Hinter einem
  // TLS-Reverse-Proxy signalisiert X-Forwarded-Proto die HTTPS-Nutzung.
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  if (proto === 'https') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
