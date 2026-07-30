import { Link } from 'react-router-dom';

// Hinweisseite für gesperrte Konten. Wird von api.js angesteuert, sobald der
// Server eine Antwort mit `blocked: true` liefert – also beim Anmeldeversuch
// wie auch bei einer Sperre mitten in der laufenden Sitzung.
export default function BlockedPage() {
  return (
    <div className="login-wrap">
      <div className="card blocked-card">
        <div className="blocked-emoji">🚫</div>
        <h1>Du bist gesperrt</h1>
        <p className="muted">
          Dein Zugang zum Essensportal wurde gesperrt. Bei Fragen wende dich bitte an die
          Administration.
        </p>
        <div className="blocked-video">
          <iframe
            src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
            title="Rick Astley – Never Gonna Give You Up"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <Link className="btn btn-block" to="/login">
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
