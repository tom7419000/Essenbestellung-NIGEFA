import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCircleCheck, faHandPointUp, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Countdown from '../components/Countdown.jsx';
import {
  DAY_STATUS,
  ORGANIZER_SOURCE_LABELS,
  fmtDateLong,
  fmtPrice,
  fmtTime,
  formatWeekdays,
  safeHttpUrl,
  statusLabel,
} from '../format.js';

export default function TodayPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api('/days/today'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  if (error && !data) return <div className="alert">{error}</div>;
  if (!data) return <div className="page-loading">Lädt …</div>;

  if (!data.day) {
    return (
      <div className="card empty-state">
        <div className="empty-emoji">🗓️</div>
        <h2>Heute keine Bestellung</h2>
        <p className="muted">Für heute wurde keine Abstimmung geplant. Schau später wieder vorbei!</p>
      </div>
    );
  }

  const { day } = data;
  // Kurz warten, bis der Server den Phasenwechsel sicher vollzogen hat.
  const reloadSoon = () => setTimeout(load, 1200);

  return (
    <div className="stack">
      <header className="page-head card">
        <div>
          <span className="eyebrow">Mittagessen</span>
          <h1>{fmtDateLong(day.date)}</h1>
          <p className="muted">
            {data.organizerName ? (
              <>
                Organisation heute: <b>{data.organizerName}</b>
                {day.organizerSource && day.organizerSource !== 'manuell' && (
                  <> ({ORGANIZER_SOURCE_LABELS[day.organizerSource]})</>
                )}
              </>
            ) : day.organizerMode === 'freiwillig' ? (
              'Organisation heute: noch offen – Freiwillige gesucht!'
            ) : day.organizerMode === 'zufaellig' ? (
              'Organisation heute: wird zufällig aus den Mitbestellern bestimmt.'
            ) : (
              'Für heute ist noch kein Organisator festgelegt.'
            )}
          </p>
          <VolunteerControls data={data} user={user} reload={load} />
        </div>
        <div className="page-head-side">
          <span className={`badge status-${day.status}`}>{DAY_STATUS[day.status]}</span>
          {day.status === 'phase1' && (
            <span className="deadline">
              Abstimmung endet {fmtTime(day.phase1Deadline)} Uhr ·{' '}
              <Countdown deadline={day.phase1Deadline} serverNow={data.serverNow} onExpire={reloadSoon} />
            </span>
          )}
          {day.status === 'phase2' && (
            <span className="deadline">
              Bestellschluss {fmtTime(day.phase2Deadline)} Uhr ·{' '}
              <Countdown deadline={day.phase2Deadline} serverNow={data.serverNow} onExpire={reloadSoon} />
            </span>
          )}
          {data.isOrganizer && (
            <Link className="btn btn-ghost" to="/organisation">
              Zur Organisation →
            </Link>
          )}
        </div>
      </header>

      {day.status === 'phase1' && <VotePanel data={data} reload={load} />}
      {day.status !== 'phase1' && <WinnerBanner data={data} />}
      {day.status === 'phase2' &&
        (data.winner && !data.winner.hasMenu ? (
          <NoMenuPanel data={data} />
        ) : (
          <OrderPanel data={data} reload={load} />
        ))}
      {day.status === 'closed' && <ClosedPanel data={data} />}
    </div>
  );
}

function VotePanel({ data, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const maxVotes = Math.max(0, ...data.restaurants.map((r) => r.votes));

  async function vote(restaurantId) {
    setBusy(true);
    setError('');
    try {
      if (data.myVote === restaurantId) {
        await api(`/days/${data.day.id}/vote`, { method: 'DELETE' });
      } else {
        await api(`/days/${data.day.id}/vote`, { method: 'POST', body: { restaurantId } });
      }
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>
        <span className="step-badge">1</span>Wo bestellen wir heute?
      </h2>
      <p className="muted">
        Stimme für ein Restaurant ab – du kannst deine Stimme bis zum Ende der Abstimmung ändern.
      </p>
      {error && <div className="alert">{error}</div>}
      <div className="option-grid">
        {data.restaurants.map((r) => {
          const mine = data.myVote === r.id;
          const leader = r.votes > 0 && r.votes === maxVotes;
          return (
            <div key={r.id} className={`option-card${mine ? ' selected' : ''}`}>
              <div className="option-main">
                <h3>
                  {r.name} {leader && <span title="Führt aktuell">🏆</span>}
                </h3>
                {r.description && <p className="muted">{r.description}</p>}
              </div>
              <div className="option-side">
                <span className="votes-badge">
                  {r.votes} {r.votes === 1 ? 'Stimme' : 'Stimmen'}
                </span>
                <button
                  className={`btn${mine ? ' btn-selected' : ''}`}
                  disabled={busy}
                  onClick={() => vote(r.id)}
                >
                  <FontAwesomeIcon icon={mine ? faCircleCheck : faCheck} />{' '}
                  {mine ? 'Deine Stimme' : 'Abstimmen'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WinnerBanner({ data }) {
  if (!data.winner) return null;
  return (
    <section className="card winner-banner">
      <div className="winner-emoji">🏆</div>
      <div>
        <h2>Heute bestellen wir bei: {data.winner.name}</h2>
        <p className="muted">
          {data.winnerVotes} {data.winnerVotes === 1 ? 'Stimme' : 'Stimmen'}
          {data.winner.phone && <> · ☎ {data.winner.phone}</>}
          {safeHttpUrl(data.winner.website) && (
            <>
              {' '}
              ·{' '}
              <a href={safeHttpUrl(data.winner.website)} target="_blank" rel="noreferrer">
                Speisekarte
              </a>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

function OrderPanel({ data, reload }) {
  const { day, menu, myOrder } = data;
  const [selectedIds, setSelectedIds] = useState(
    () => new Set((myOrder?.items || []).map((i) => i.menuItemId).filter((x) => x != null))
  );
  const [note, setNote] = useState(myOrder?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedTotal = menu
    .filter((m) => selectedIds.has(m.id))
    .reduce((s, m) => (m.priceCents != null ? s + m.priceCents : s), 0);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/days/${day.id}/order`, {
        method: 'POST',
        body: { menuItemIds: [...selectedIds], note },
      });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api(`/days/${day.id}/order`, { method: 'DELETE' });
      setSelectedIds(new Set());
      setNote('');
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>
        <span className="step-badge">2</span>Essen auswählen
      </h2>
      {myOrder ? (
        <div className="notice success">
          Deine Bestellung ist gespeichert:{' '}
          <b>{(myOrder.items || []).map((i) => i.itemName || 'Unbekanntes Gericht').join(', ')}</b>
          {myOrder.totalCents > 0 && <> · {fmtPrice(myOrder.totalCents)}</>}
          {myOrder.note && <> („{myOrder.note}“)</>}. Du kannst sie bis zum Bestellschluss ändern.
        </div>
      ) : (
        <p className="muted">
          Wähle ein oder mehrere Gerichte (z. B. Vorspeise, Hauptgang und Beilage) und gib optional
          eine Bemerkung an.
        </p>
      )}
      {error && <div className="alert">{error}</div>}
      <form onSubmit={save} className="stack">
        <div className="menu-list">
          {groupByCategory(menu).map(([category, items]) => (
            <div key={category || 'ohne-kategorie'} className="menu-group">
              {category && <h3 className="menu-category">{category}</h3>}
              {items.map((item) => (
                <label
                  key={item.id}
                  className={`menu-item${selectedIds.has(item.id) ? ' selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="menu-item-name">
                    {item.name}
                    {item.weekdays && item.weekdays.length > 0 && (
                      <span className="badge badge-plan menu-item-weekdays">
                        Tagesessen · {formatWeekdays(item.weekdays)}
                      </span>
                    )}
                    {(item.description || item.allergens) && (
                      <small className="muted">
                        {item.description}
                        {item.description && item.allergens && ' · '}
                        {item.allergens && <>Allergene: {item.allergens}</>}
                      </small>
                    )}
                  </span>
                  <span className="menu-item-price">{fmtPrice(item.priceCents)}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        {selectedIds.size > 0 && (
          <div className="order-total-line">
            {selectedIds.size} {selectedIds.size === 1 ? 'Gericht' : 'Gerichte'} ausgewählt · Summe{' '}
            <b>{fmtPrice(selectedTotal)}</b>
          </div>
        )}
        <label>
          Bemerkung (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. ohne Zwiebeln, extra scharf …"
            maxLength={500}
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" disabled={busy || selectedIds.size === 0}>
            <FontAwesomeIcon icon={faCheck} />{' '}
            {myOrder ? 'Bestellung aktualisieren' : 'Verbindlich bestellen'}
          </button>
          {myOrder && (
            <button type="button" className="btn btn-danger-ghost" disabled={busy} onClick={remove}>
              <FontAwesomeIcon icon={faTrash} /> Bestellung löschen
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

// Freiwillig als Organisator eintragen bzw. wieder austragen (nur im Modus
// "freiwillig"; eintragen können sich Mitbesteller, solange der Platz frei ist).
function VolunteerControls({ data, user, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { day } = data;

  if (day.organizerMode !== 'freiwillig' || day.status === 'closed') return null;

  const iAmVolunteer = day.organizerId === user.id && day.organizerSource === 'freiwillig';
  const canVolunteer = !day.organizerId && day.status === 'phase2' && Boolean(data.myOrder);

  async function call(method) {
    setBusy(true);
    setError('');
    try {
      await api(`/days/${day.id}/volunteer`, { method });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="volunteer-controls">
      {error && <div className="alert">{error}</div>}
      {canVolunteer && (
        <button className="btn btn-sm" disabled={busy} onClick={() => call('POST')}>
          <FontAwesomeIcon icon={faHandPointUp} /> Als Organisator eintragen
        </button>
      )}
      {!day.organizerId && day.status === 'phase2' && !data.myOrder && (
        <small className="muted">Sobald du bestellt hast, kannst du dich als Organisator eintragen.</small>
      )}
      {iAmVolunteer && (
        <button className="btn btn-sm" disabled={busy} onClick={() => call('DELETE')}>
          <FontAwesomeIcon icon={faXmark} /> Als Organisator austragen
        </button>
      )}
    </div>
  );
}

// Speisekarte nach Kategorie gruppieren (Server liefert bereits sortiert);
// Gerichte ohne Kategorie erscheinen zuerst, ohne Zwischenüberschrift.
function groupByCategory(menu) {
  const map = new Map();
  for (const item of menu) {
    const category = item.category || '';
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(item);
  }
  return [...map.entries()];
}

function NoMenuPanel({ data }) {
  return (
    <section className="card">
      <h2>
        <span className="step-badge">2</span>Essen auswählen
      </h2>
      <div className="notice">
        Für dieses Restaurant ist <b>keine Speisekarte hinterlegt</b> – bitte individuell
        bestellen bzw. direkt anrufen{data.winner?.phone && <> (☎ {data.winner.phone})</>}
        {data.organizerName && (
          <>
            {' '}
            oder mit <b>{data.organizerName}</b> (Organisation) absprechen
          </>
        )}
        .
      </div>
    </section>
  );
}

function ClosedPanel({ data }) {
  if (data.winner && !data.winner.hasMenu) {
    return (
      <section className="card">
        <h2>Bestellphase beendet</h2>
        <p className="muted">
          Für dieses Restaurant war keine Speisekarte hinterlegt – die Bestellungen wurden
          individuell abgesprochen.
        </p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Bestellphase beendet</h2>
      {data.myOrder ? (
        <p>
          Deine Bestellung:{' '}
          <b>{(data.myOrder.items || []).map((i) => i.itemName || 'Unbekanntes Gericht').join(', ')}</b>{' '}
          ({fmtPrice(data.myOrder.totalCents)})
          {data.myOrder.note && <> – Bemerkung: „{data.myOrder.note}“</>} · Status:{' '}
          <span className={`badge order-${data.myOrder.status}`}>{statusLabel(data.myOrder.status)}</span>
        </p>
      ) : (
        <p className="muted">Du hast heute nichts bestellt.</p>
      )}
      <p className="muted">
        Insgesamt {data.orderCount} {data.orderCount === 1 ? 'Bestellung' : 'Bestellungen'}
        {data.organizerName && <> · Organisation: {data.organizerName}</>}
      </p>
    </section>
  );
}
