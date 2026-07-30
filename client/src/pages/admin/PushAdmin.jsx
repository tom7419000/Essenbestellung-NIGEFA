import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api.js';

const EMPTY = { title: '', body: '', url: '' };

// Rundnachricht an alle Konten mit aktivierter Push-Benachrichtigung.
// Der Server versendet im Hintergrund und antwortet sofort; das Ergebnis
// holen wir danach kurz nach (GET /push/broadcast).
export default function PushAdmin() {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api('/push/broadcast'));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Solange der Versand läuft, den Stand nachziehen.
  useEffect(() => {
    if (!info?.last?.running) return undefined;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [info?.last?.running, load]);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/push/broadcast', { method: 'POST', body: form });
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <div className="page-loading">Lädt …</div>;

  const last = info.last;

  return (
    <div className="stack">
      <div className="card">
        <h1>Benachrichtigung an alle</h1>
        <p className="muted">
          Sendet eine Push-Benachrichtigung an alle Konten, die Benachrichtigungen aktiviert
          haben. Gesperrte und deaktivierte Konten werden übersprungen.
        </p>
        {!info.available && (
          <div className="alert">Push ist auf dem Server nicht verfügbar.</div>
        )}
        {error && <div className="alert">{error}</div>}
        <div className="notice">
          Aktuell erreichbar: <b>{info.recipients}</b>{' '}
          {info.recipients === 1 ? 'Konto' : 'Konten'} mit aktivierter Benachrichtigung.
        </div>

        <form className="stack" onSubmit={send}>
          <label>
            Titel
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={80}
              required
              placeholder="z. B. Bestellschluss vorgezogen"
            />
          </label>
          <label>
            Nachricht
            <textarea
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              maxLength={300}
              required
              placeholder="z. B. Heute bitte bis 11:00 Uhr bestellen."
            />
          </label>
          <label>
            Ziel beim Antippen (optional)
            <select value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}>
              <option value="">Startseite</option>
              {info.targets.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={busy || !info.available || info.recipients === 0}
            >
              <FontAwesomeIcon icon={faPaperPlane} /> {busy ? 'Wird gesendet …' : 'Senden'}
            </button>
          </div>
        </form>
      </div>

      {last && (
        <div className="card">
          <h2>Letzter Versand</h2>
          <p className="muted">„{last.title}"</p>
          {last.running ? (
            <div className="notice">
              Versand läuft … {last.sent + last.failed} von {last.recipients} verarbeitet.
            </div>
          ) : (
            <div className={`notice${last.failed === 0 ? ' success' : ''}`}>
              An <b>{last.sent} von {last.recipients}</b>{' '}
              {last.recipients === 1 ? 'Konto' : 'Konten'} gesendet.
              {last.failed > 0 && (
                <>
                  {' '}
                  {last.failed} nicht zugestellt (z. B. abgelaufene Berechtigung) – abgelaufene
                  Abonnements wurden entfernt.
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
