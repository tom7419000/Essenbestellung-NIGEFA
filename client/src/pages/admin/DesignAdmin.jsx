import { useEffect, useRef, useState } from 'react';
import { api, apiUpload } from '../../api.js';
import { DEFAULT_COLORS, applyColors, useBranding } from '../../branding/BrandingContext.jsx';

const COLOR_FIELDS = [
  { key: 'primary', label: 'Primärfarbe', hint: 'Buttons, aktive Navigation, Hervorhebungen' },
  { key: 'secondary', label: 'Sekundärfarbe', hint: 'Hinweise, Phase-1-Status, Links' },
  { key: 'accent', label: 'Akzentfarbe', hint: 'Erfolg, eigene Auswahl, „Geliefert“-Status' },
];

export default function DesignAdmin() {
  const { branding, refresh } = useBranding();
  const [colors, setColors] = useState(branding.colors);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setColors(branding.colors);
  }, [branding.colors]);

  // Beim Verlassen der Seite ohne Speichern: Vorschau zurücksetzen.
  const storedColorsRef = useRef(branding.colors);
  useEffect(() => {
    storedColorsRef.current = branding.colors;
  }, [branding.colors]);
  useEffect(() => () => applyColors(storedColorsRef.current), []);

  function preview(next) {
    setColors(next);
    applyColors(next); // Live-Vorschau in der gesamten App
    setMessage('');
  }

  async function saveColors(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/branding/colors', { method: 'PUT', body: colors });
      await refresh();
      setMessage('Farbschema gespeichert.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetColors() {
    setError('');
    try {
      await api('/branding/colors', { method: 'PUT', body: DEFAULT_COLORS });
      await refresh();
      setMessage('Farbschema auf Standard zurückgesetzt.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h1>Design &amp; Branding</h1>
        <p className="muted">
          Logo, Favicon und Farbschema der Anwendung. Änderungen gelten sofort für alle
          Benutzer.
        </p>
        {error && <div className="alert">{error}</div>}
        {message && <div className="notice success">{message}</div>}
      </div>

      <div className="card">
        <h2>Farbschema</h2>
        <form className="stack" onSubmit={saveColors}>
          <div className="color-grid">
            {COLOR_FIELDS.map((f) => (
              <div key={f.key} className="color-field">
                <label>
                  {f.label}
                  <span className="color-inputs">
                    <input
                      type="color"
                      value={colors[f.key]}
                      onChange={(e) => preview({ ...colors, [f.key]: e.target.value })}
                    />
                    <input
                      className="color-hex"
                      value={colors[f.key]}
                      pattern="#[0-9a-fA-F]{6}"
                      onChange={(e) => {
                        const v = e.target.value;
                        setColors({ ...colors, [f.key]: v });
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) preview({ ...colors, [f.key]: v });
                      }}
                    />
                  </span>
                </label>
                <small className="muted">{f.hint}</small>
              </div>
            ))}
          </div>
          <p className="muted">
            Die Farben werden live in der Vorschau angewendet und erst mit „Speichern“
            übernommen. Die Textfarbe auf Primär-/Akzentflächen wird automatisch
            kontrastsicher gewählt.
          </p>
          <div className="row">
            <button className="btn btn-primary">Speichern</button>
            <button type="button" className="btn" onClick={resetColors}>
              Auf Standard zurücksetzen
            </button>
          </div>
        </form>
      </div>

      <div className="two-col">
        <UploadCard
          title="Logo"
          hint="Wird im Kopfbereich und auf der Anmeldeseite angezeigt. PNG, SVG, JPEG oder WebP, max. 1 MB."
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          maxBytes={1024 * 1024}
          endpoint="/branding/logo"
          currentUrl={branding.logoUrl}
          previewClass="upload-preview-logo"
          onChanged={refresh}
        />
        <UploadCard
          title="Favicon"
          hint="Browser-Tab-Symbol, wird automatisch als /favicon.ico eingebunden. PNG, SVG oder ICO, max. 512 KB."
          accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
          maxBytes={512 * 1024}
          endpoint="/branding/favicon"
          currentUrl={branding.faviconUrl}
          previewClass="upload-preview-favicon"
          onChanged={refresh}
        />
      </div>
    </div>
  );
}

function UploadCard({ title, hint, accept, maxBytes, endpoint, currentUrl, previewClass, onChanged }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > maxBytes) {
      setError(`Die Datei ist zu groß (max. ${Math.round(maxBytes / 1024)} KB).`);
      return;
    }
    setBusy(true);
    try {
      await apiUpload(endpoint, file);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError('');
    setBusy(true);
    try {
      await api(endpoint, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      {error && <div className="alert">{error}</div>}
      <div className="upload-row">
        <div className={`upload-preview ${previewClass}`}>
          {currentUrl ? (
            <img src={currentUrl} alt={`Aktuelles ${title}`} />
          ) : (
            <span className="muted">kein {title} hinterlegt</span>
          )}
        </div>
        <div className="row wrap">
          <input ref={inputRef} type="file" accept={accept} onChange={upload} hidden />
          <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current.click()}>
            {currentUrl ? `${title} ersetzen` : `${title} hochladen`}
          </button>
          {currentUrl && (
            <button className="btn btn-danger-ghost" disabled={busy} onClick={remove}>
              Entfernen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
