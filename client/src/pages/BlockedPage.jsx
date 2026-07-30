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
        {/* mute=1 ist nötig, damit der Autoplay greift: Browser starten ein
            Video mit Ton nur nach einer Interaktion auf DIESER Seite – die
            gibt es hier nicht, weil die Seite frisch geladen wird. Der Ton
            lässt sich im Player mit einem Klick einschalten. */}
        <div className="blocked-video">
          <iframe
            src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&playsinline=1"
            title="Rick Astley – Never Gonna Give You Up"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <p className="muted blocked-hint">🔊 Ton im Player einschalten.</p>
        <Link className="btn btn-block" to="/login">
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
