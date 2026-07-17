import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRightToBracket } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../auth/AuthContext.jsx';
import { useBranding } from '../branding/BrandingContext.jsx';

// Offizielles Microsoft-Logo (vier Quadrate) gemäß Microsoft-Branding-
// Richtlinien für „Mit Microsoft anmelden“-Buttons.
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, loading, login, loginSso, ssoEnabled, ssoAutoRedirect, ssoError } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Optional (Admin → Anmeldung: „automatisch weiterleiten“): ohne Sitzung
  // direkt zum Microsoft-Login.
  useEffect(() => {
    if (!loading && !user && ssoEnabled && ssoAutoRedirect && !ssoError) {
      loginSso().catch(() => {});
    }
  }, [loading, user, ssoEnabled, ssoAutoRedirect, ssoError, loginSso]);

  if (loading) return <div className="page-loading">Lädt …</div>;
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={onSubmit}>
        {branding.logoUrl ? (
          <img className="login-logo" src={branding.logoUrl} alt="Logo" />
        ) : (
          <div className="login-brand">🍽️</div>
        )}
        <h1>Essensbestellung</h1>
        <p className="muted">Bitte melde dich an, um abzustimmen und zu bestellen.</p>
        {(error || ssoError) && <div className="alert">{error || ssoError}</div>}
        {ssoEnabled && (
          <>
            <button
              type="button"
              className="ms-signin-btn"
              disabled={busy}
              onClick={() => loginSso().catch((e) => setError(e.message))}
            >
              <MicrosoftLogo />
              <span>Mit Microsoft anmelden</span>
            </button>
            <div className="login-divider">
              <span>oder mit lokalem Konto</span>
            </div>
          </>
        )}
        <label>
          Benutzername
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus={!ssoEnabled}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Passwort
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          <FontAwesomeIcon icon={faRightToBracket} /> {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
