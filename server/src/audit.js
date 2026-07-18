// Schlankes Sicherheits-Audit-Log (Audit M4). Schreibt strukturierte
// JSON-Zeilen nach stdout – beim systemd-Dienst landen sie über journald in
// den Logs (journalctl -u essen-nigefa). Es werden bewusst KEINE Passwörter,
// Token, Client-Assertions oder sonstigen Secrets protokolliert.

export function auditLog(event, req, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    audit: event,
    ip: req?.ip || req?.socket?.remoteAddress || null,
  };
  if (req?.user) entry.actor = { id: req.user.id, username: req.user.username };
  Object.assign(entry, details);
  // Einzeilig, damit es sich gut greppen/weiterverarbeiten lässt.
  console.log(`[audit] ${JSON.stringify(entry)}`);
}
