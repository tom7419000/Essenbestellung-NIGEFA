import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faBellSlash, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import {
  disablePush,
  enablePush,
  fetchPushStatus,
  permissionState,
  pushSupported,
  sendTestPush,
} from '../push.js';

export default function SettingsPage() {
  const supported = pushSupported();
  const [permission, setPermission] = useState(permissionState());
  const [status, setStatus] = useState(null); // { available, subscribed }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    setStatus(await fetchPushStatus());
    setPermission(permissionState());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function enable() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await enablePush();
      await refresh();
      setMessage('Push-Benachrichtigungen sind aktiviert.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await disablePush();
      await refresh();
      setMessage('Push-Benachrichtigungen wurden auf diesem Gerät deaktiviert.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await sendTestPush();
      setMessage('Test-Benachrichtigung gesendet – sie sollte gleich erscheinen.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const serverAvailable = status?.available;
  const subscribed = status?.subscribed;

  return (
    <div className="stack">
      <div className="card">
        <h1>Einstellungen</h1>
        <p className="muted">Persönliche Einstellungen für dieses Benutzerkonto.</p>
      </div>

      <div className="card">
        <h2>
          <FontAwesomeIcon icon={faBell} /> Push-Benachrichtigungen
        </h2>
        <p className="muted">
          Als Organisator eines Tages wirst du benachrichtigt, wenn du – auch per
          Zufallsauswahl – zum Organisator bestimmt wirst und wenn die Bestellphase endet
          (Erinnerung zum Sammeln/Aufgeben der Bestellung).
        </p>

        {error && <div className="alert">{error}</div>}
        {message && <div className="notice success">{message}</div>}

        {!supported ? (
          <div className="notice">
            Dieser Browser unterstützt keine Push-Benachrichtigungen. Die Hinweise erscheinen
            weiterhin sichtbar im Portal (auf „Heute“ und unter „Organisation“).
          </div>
        ) : serverAvailable === false ? (
          <div className="notice">
            Auf dem Server sind Push-Benachrichtigungen derzeit nicht eingerichtet. Die Hinweise
            erscheinen weiterhin im Portal.
          </div>
        ) : permission === 'denied' ? (
          <div className="notice">
            Benachrichtigungen sind in den Browser-Einstellungen für diese Seite blockiert. Bitte
            dort erlauben, um Push zu nutzen. Bis dahin erscheinen die Hinweise im Portal.
          </div>
        ) : (
          <div className="stack">
            <div className="row wrap">
              <span className="badge-status">
                Status auf diesem Gerät:{' '}
                {subscribed ? (
                  <span className="badge badge-ok">aktiv</span>
                ) : (
                  <span className="badge badge-off">nicht aktiv</span>
                )}
              </span>
            </div>
            <div className="row wrap">
              {subscribed ? (
                <>
                  <button className="btn" disabled={busy} onClick={disable}>
                    <FontAwesomeIcon icon={faBellSlash} /> Auf diesem Gerät deaktivieren
                  </button>
                  <button className="btn btn-primary" disabled={busy} onClick={test}>
                    <FontAwesomeIcon icon={faPaperPlane} /> Test senden
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" disabled={busy} onClick={enable}>
                  <FontAwesomeIcon icon={faBell} /> Benachrichtigungen aktivieren
                </button>
              )}
            </div>
            <p className="muted">
              Die Aktivierung gilt pro Gerät/Browser. Beim Aktivieren fragt der Browser einmalig
              nach deiner Erlaubnis.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
