import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFloppyDisk, faLocationCrosshairs, faPlugCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api.js';

export default function SsoAdmin() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const s = await api('/sso/settings');
    setSettings(s);
    setForm({
      enabled: s.enabled,
      autoRedirect: s.autoRedirect,
      clientId: s.clientId || '',
      tenantId: s.tenantId || '',
      ficIssuer: s.ficIssuer || '',
      ficSubject: s.ficSubject || '',
      ficAudience: s.ficAudience || '',
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setTestResult(null);
    setBusy(true);
    try {
      const s = await api('/sso/settings', { method: 'PUT', body: form });
      setSettings(s);
      setMessage(s.enabled ? 'Gespeichert – SSO ist aktiv.' : 'Gespeichert – SSO ist deaktiviert.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setError('');
    setMessage('');
    setTestResult(null);
    setBusy(true);
    try {
      // Erst speichern, damit der Test die sichtbaren Werte prüft
      const s = await api('/sso/settings', { method: 'PUT', body: form });
      setSettings(s);
      setTestResult(await api('/sso/test', { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !form) return <div className="alert">{error}</div>;
  if (!form || !settings) return <div className="page-loading">Lädt …</div>;

  const origin = window.location.origin;
  const effSubject = form.ficSubject || settings.defaults.ficSubject;
  const effAudience = form.ficAudience || settings.defaults.ficAudience;
  const effIssuer = form.ficIssuer || '– noch nicht gesetzt –';

  return (
    <div className="stack">
      <div className="card">
        <span className="eyebrow">Administration</span>
        <h1>Anmeldung (SSO) – Microsoft Entra ID</h1>
        <p className="muted">
          Single Sign-On über Entra ID. Der Benutzer-Login läuft als Public Client mit
          Authorization Code + PKCE (ohne Client-Secret); der Server meldet sich über die{' '}
          <b>Verbundanmeldeinformation</b> (Federated Credential) bei Entra ID an – es muss
          also kein Geheimnis gespeichert oder rotiert werden. Details: docs/sso-entra-id.md.
        </p>
        {settings.enabled ? (
          <div className="notice success">SSO ist <b>aktiv</b>{settings.source === 'env' && ' (Werte aus Umgebungsvariablen übernommen)'}.</div>
        ) : (
          <div className="notice">SSO ist <b>deaktiviert</b> – der Microsoft-Button erscheint nicht auf der Login-Seite.</div>
        )}
        {error && <div className="alert">{error}</div>}
        {message && <div className="notice success">{message}</div>}
        {testResult && (
          <div className={testResult.ok ? 'notice success' : 'alert'}>
            {testResult.ok ? '✓ ' : ''}
            {testResult.message}
          </div>
        )}
      </div>

      <form className="card stack" onSubmit={save}>
        <h2>Konfiguration</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          SSO aktivieren (Microsoft-Button auf der Login-Seite anzeigen)
        </label>
        <div className="form-grid">
          <label>
            Client-ID (Anwendungs-ID)
            <input
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000000"
              spellCheck={false}
            />
          </label>
          <label>
            Tenant-ID (Verzeichnis-ID)
            <input
              value={form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000000"
              spellCheck={false}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.autoRedirect}
            onChange={(e) => setForm({ ...form, autoRedirect: e.target.checked })}
          />
          Benutzer ohne Sitzung automatisch zum Microsoft-Login weiterleiten
        </label>

        <fieldset className="restaurant-picker">
          <legend>Verbundanmeldeinformation (Federated Credential)</legend>
          <p className="muted">
            Diese Werte müssen exakt mit der Verbundanmeldeinformation in der Azure-App-
            Registrierung übereinstimmen. Die Issuer-URL ist die öffentliche Basis-Adresse
            dieses Portals – Entra ID ruft darüber die Signatur-Schlüssel ab, sie muss also
            per HTTPS aus dem Internet erreichbar sein.
          </p>
          <div className="form-grid">
            <label>
              Issuer-URL
              <span className="row">
                <input
                  style={{ flex: 1 }}
                  value={form.ficIssuer}
                  onChange={(e) => setForm({ ...form, ficIssuer: e.target.value })}
                  placeholder={origin}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  title="Aktuelle Portal-Adresse übernehmen"
                  onClick={() => setForm({ ...form, ficIssuer: origin })}
                >
                  <FontAwesomeIcon icon={faLocationCrosshairs} /> Übernehmen
                </button>
              </span>
            </label>
            <label>
              Subject (Subject Identifier)
              <input
                value={form.ficSubject}
                onChange={(e) => setForm({ ...form, ficSubject: e.target.value })}
                placeholder={settings.defaults.ficSubject}
                spellCheck={false}
              />
            </label>
            <label>
              Audience
              <input
                value={form.ficAudience}
                onChange={(e) => setForm({ ...form, ficAudience: e.target.value })}
                placeholder={settings.defaults.ficAudience}
                spellCheck={false}
              />
            </label>
          </div>
        </fieldset>

        <div className="row wrap">
          <button className="btn btn-primary" disabled={busy}>
            <FontAwesomeIcon icon={faFloppyDisk} /> Speichern
          </button>
          <button type="button" className="btn" disabled={busy} onClick={testConnection}>
            <FontAwesomeIcon icon={faPlugCircleCheck} /> Verbindung testen
          </button>
        </div>
        <p className="muted">
          „Verbindung testen“ speichert die Werte und holt anschließend mit der
          Verbundanmeldeinformation ein echtes Token von Entra ID – schlägt der Test fehl,
          wird die Original-Fehlermeldung von Entra (AADSTS…) angezeigt.
        </p>
      </form>

      <div className="card">
        <h2>Diese Werte in Azure eintragen</h2>
        <div className="table-scroll">
          <table>
            <tbody>
              <tr>
                <td>Redirect-URI (Plattform „Single-Page-Anwendung“)</td>
                <td><code>{origin}</code></td>
              </tr>
              <tr>
                <td>Verbundanmeldung → Issuer</td>
                <td><code>{effIssuer}</code></td>
              </tr>
              <tr>
                <td>Verbundanmeldung → Subject Identifier</td>
                <td><code>{effSubject}</code></td>
              </tr>
              <tr>
                <td>Verbundanmeldung → Audience</td>
                <td><code>{effAudience}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">
          Azure-Portal: <b>Entra ID → App-Registrierungen → (App) → Zertifikate &amp;
          Geheimnisse → Verbundanmeldeinformationen → Anmeldeinformation hinzufügen →
          Szenario „Anderer Aussteller“</b>. Die Schritt-für-Schritt-Anleitung steht in
          docs/sso-entra-id.md.
        </p>
      </div>
    </div>
  );
}
