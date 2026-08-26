import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faCartShopping,
  faCheck,
  faChevronRight,
  faCircleCheck,
  faDharmachakra,
  faHandPointUp,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Countdown from '../components/Countdown.jsx';
import ItemLabel from '../components/ItemLabel.jsx';
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
              'Organisation heute: wird nach Bestellschluss zufällig aus den Mitbestellern bestimmt.'
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

      {day.status === 'phase1' && data.restaurants.length > 0 && (
        <VotePanel data={data} reload={load} />
      )}
      {day.status !== 'phase1' && <WinnerBanner data={data} />}
      {day.status !== 'phase1' && !data.winner && <NoWinnerPanel data={data} />}
      {day.status === 'phase2' &&
        data.winner &&
        (data.winner.hasMenu ? (
          <OrderPanel data={data} reload={load} />
        ) : (
          <NoMenuPanel data={data} />
        ))}
      {(data.participationOptions?.length ?? 0) > 0 && (
        <ParticipationPanel data={data} reload={load} />
      )}
      {day.status === 'closed' && data.winner && <ClosedPanel data={data} />}
    </div>
  );
}

function ParticipationPanel({ data, reload }) {
  const { day, participationOptions } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = new Date().toLocaleDateString('sv-SE');
  const locked = day.date < today; // vergangene Tage sind gesperrt

  async function toggle(restaurantId, iParticipate) {
    setBusy(true);
    setError('');
    try {
      await api(`/days/${day.id}/participation`, {
        method: iParticipate ? 'DELETE' : 'POST',
        body: { restaurantId },
      });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card participation-card">
      <h2>
        <FontAwesomeIcon icon={faCartShopping} /> Ohne Bestellung – wer geht mit?
      </h2>
      <p className="muted">
        Für diese Orte (z. B. Supermarkt) gibt es keine gemeinsame Bestellung. Trage dich
        unverbindlich ein, wenn du mitgehst – du kannst dich jederzeit wieder austragen.
      </p>
      {error && <div className="alert">{error}</div>}
      <div className="participation-list">
        {participationOptions.map((o) => (
          <div key={o.id} className={`participation-option${o.iParticipate ? ' selected' : ''}`}>
            <div className="participation-main">
              <h3>
                {o.name}
                <span className="badge badge-participation">Teilnahme – keine Bestellung</span>
              </h3>
              {o.description && <p className="muted">{o.description}</p>}
              <p className="participation-people">
                {o.count === 0 ? (
                  <span className="muted">Noch niemand eingetragen.</span>
                ) : (
                  <>
                    <b>
                      {o.count} {o.count === 1 ? 'Person' : 'Personen'}:
                    </b>{' '}
                    {o.participants.join(', ')}
                  </>
                )}
              </p>
            </div>
            {!locked && (
              <div className="participation-side">
                <button
                  className={`btn${o.iParticipate ? ' btn-selected' : ''}`}
                  disabled={busy}
                  title={o.iParticipate ? 'Zum Austragen klicken' : 'Unverbindlich eintragen'}
                  onClick={() => toggle(o.id, o.iParticipate)}
                >
                  <FontAwesomeIcon icon={o.iParticipate ? faCircleCheck : faHandPointUp} />{' '}
                  {o.iParticipate ? 'Ich bin dabei' : 'Ich gehe mit'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function VotePanel({ data, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const [showVotersFor, setShowVotersFor] = useState(null);
  const [wheelOpen, setWheelOpen] = useState(false);
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
      {/* Glücksrad nur, solange noch keine Stimme vorliegt – es entscheidet
          für die eigene, offene Stimme. */}
      {!data.myVote && data.restaurants.length > 1 && (
        <button type="button" className="btn wheel-btn" disabled={busy} onClick={() => setWheelOpen(true)}>
          <FontAwesomeIcon icon={faDharmachakra} /> Glücksrad – Stimme zufällig vergeben
        </button>
      )}
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm option-menu-btn"
                  onClick={() => setMenuFor(r)}
                >
                  <FontAwesomeIcon icon={faBookOpen} /> Speisekarte
                </button>
              </div>
              <div className="option-side">
                <button
                  type="button"
                  className="votes-badge votes-badge-btn"
                  title={
                    r.voters.length ? `Abgestimmt: ${r.voters.join(', ')}` : 'Noch keine Stimmen'
                  }
                  aria-expanded={showVotersFor === r.id}
                  disabled={r.votes === 0}
                  onClick={() => setShowVotersFor(showVotersFor === r.id ? null : r.id)}
                >
                  {r.votes} {r.votes === 1 ? 'Stimme' : 'Stimmen'}
                </button>
                <button
                  className={`btn${mine ? ' btn-selected' : ''}`}
                  disabled={busy}
                  onClick={() => vote(r.id)}
                >
                  <FontAwesomeIcon icon={mine ? faCircleCheck : faCheck} />{' '}
                  {mine ? 'Deine Stimme' : 'Abstimmen'}
                </button>
              </div>
              {showVotersFor === r.id && r.voters.length > 0 && (
                <div className="option-voters">
                  <b>Abgestimmt:</b> {r.voters.join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {menuFor && (
        <MenuModal dayId={data.day.id} restaurant={menuFor} onClose={() => setMenuFor(null)} />
      )}
      {wheelOpen && (
        <WheelModal
          dayId={data.day.id}
          restaurants={data.restaurants}
          onClose={() => {
            setWheelOpen(false);
            reload();
          }}
        />
      )}
    </section>
  );
}

const WHEEL_SPINS = 5; // volle Umdrehungen vor dem Stopp
const WHEEL_MS = 4200;

// Farbpaare aus dem Badge-Satz des Portals: in hellem wie dunklem Modus
// erprobt kontrastreich (Fläche hell getönt, Schrift kräftig).
const WHEEL_COLORS = [
  { fill: 'var(--accent-soft)', text: 'var(--accent-dark)' },
  { fill: 'var(--blue-soft)', text: 'var(--blue)' },
  { fill: 'var(--green-soft)', text: 'var(--green)' },
  { fill: 'var(--amber-soft)', text: 'var(--amber)' },
  { fill: 'var(--red-soft)', text: 'var(--red)' },
];

// Kreissegment als SVG-Pfad. 0° zeigt nach oben (12 Uhr), im Uhrzeigersinn.
function segmentPath(index, count, cx, cy, r) {
  const seg = 360 / count;
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  if (count === 1) {
    // Vollkreis lässt sich nicht als einzelner Bogen zeichnen.
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const [x1, y1] = toXY(index * seg);
  const [x2, y2] = toXY((index + 1) * seg);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

// Glücksrad für die eigene, noch nicht abgegebene Stimme.
//
// Wichtig: Das Ergebnis bestimmt AUSSCHLIESSLICH der Server. Beim Öffnen ruft
// die Komponente POST /days/:id/vote/random auf – dort wird per crypto.randomInt
// gezogen und die Stimme sofort verbucht. Erst danach beginnt die Drehung, die
// lediglich auf das bereits feststehende Segment hinführt. Ein Eingriff im
// Browser (Abbruch, veränderte Animation, erneuter Aufruf) ändert die bereits
// gespeicherte Stimme nicht; ein zweiter Dreh wird serverseitig abgelehnt.
function WheelModal({ dayId, restaurants, onClose }) {
  // Segmentliste beim Öffnen einfrieren, damit das Neuladen im Hintergrund
  // (Polling alle 15 s) die laufende Drehung nicht neu startet.
  const [segments] = useState(() => restaurants);
  const [angle, setAngle] = useState(0);
  const [winner, setWinner] = useState(null);
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    let active = true;
    let timer = null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    api(`/days/${dayId}/vote/random`, { method: 'POST' })
      .then((d) => {
        if (!active) return;
        const index = segments.findIndex((r) => r.id === d.restaurantId);
        if (index < 0) {
          setError('Unerwartetes Ergebnis – bitte die Seite neu laden.');
          return;
        }
        const seg = 360 / segments.length;
        // Versatz innerhalb des Segments: rein optisch, damit das Rad nicht
        // immer exakt mittig stoppt. Bleibt sicher innerhalb des Segments.
        const jitter = (Math.random() - 0.5) * seg * 0.6;
        const center = index * seg + seg / 2;
        if (reduced) {
          setAngle(-center);
          setWinner(segments[index]);
          return;
        }
        setAngle(360 * WHEEL_SPINS - center - jitter);
        timer = setTimeout(() => active && setWinner(segments[index]), WHEEL_MS);
      })
      .catch((e) => active && setError(e.message));

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [dayId, segments]);

  const size = 260;
  const c = size / 2;
  const r = c - 6;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal wheel-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Glücksrad"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Glücksrad</h2>
          <button className="btn btn-ghost" aria-label="Schließen" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="modal-body wheel-body">
          {error ? (
            <div className="alert">{error}</div>
          ) : (
            <>
              <div className="wheel-stage">
                <div className="wheel-pointer" aria-hidden="true" />
                <svg
                  className="wheel-svg"
                  width={size}
                  height={size}
                  viewBox={`0 0 ${size} ${size}`}
                  role="img"
                  aria-label={`Rad mit ${segments.length} Restaurants`}
                  style={{
                    transform: `rotate(${angle}deg)`,
                    transition: `transform ${WHEEL_MS}ms cubic-bezier(.15,.9,.2,1)`,
                  }}
                >
                  {segments.map((restaurant, i) => {
                    const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
                    const seg = 360 / segments.length;
                    const mid = i * seg + seg / 2;
                    const ty = c - r * 0.62;
                    // Beschriftung in der unteren Radhälfte um die eigene
                    // Achse kippen, sonst steht sie auf dem Kopf.
                    const upright = mid > 90 && mid < 270 ? ` rotate(180 ${c} ${ty})` : '';
                    return (
                      <g key={restaurant.id}>
                        <path
                          d={segmentPath(i, segments.length, c, c, r)}
                          fill={color.fill}
                          stroke="var(--card)"
                          strokeWidth="2"
                        />
                        <text
                          x={c}
                          y={ty}
                          fill={color.text}
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${mid} ${c} ${c})${upright}`}
                        >
                          {restaurant.name.length > 16
                            ? `${restaurant.name.slice(0, 15)}…`
                            : restaurant.name}
                        </text>
                      </g>
                    );
                  })}
                  <circle cx={c} cy={c} r="16" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
                </svg>
              </div>
              <div className="wheel-result" aria-live="polite">
                {winner ? (
                  <>
                    <strong>{winner.name}</strong>
                    <span className="muted">Deine Stimme wurde abgegeben.</span>
                  </>
                ) : (
                  <span className="muted">Das Rad dreht sich …</span>
                )}
              </div>
              {winner && (
                <button className="btn btn-primary btn-block" onClick={onClose}>
                  <FontAwesomeIcon icon={faCheck} /> Alles klar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Speisekarten-Vorschau (Modal) für ein Restaurant in Phase 1. Schließt per
// X-Button, Klick außerhalb und ESC. Öffnet sich getrennt vom Abstimm-Button,
// damit das Ansehen der Karte nicht versehentlich eine Stimme abgibt.
function MenuModal({ dayId, restaurant, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    let active = true;
    api(`/days/${dayId}/menu/${restaurant.id}`)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [dayId, restaurant.id, onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Speisekarte ${restaurant.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{restaurant.name}</h2>
          <button className="btn btn-ghost" aria-label="Schließen" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="alert">{error}</div>}
          {!data && !error && <div className="page-loading">Lädt …</div>}
          {data &&
            (!data.restaurant.hasMenu ? (
              <p className="muted">Keine Speisekarte hinterlegt.</p>
            ) : data.menu.length === 0 ? (
              <p className="muted">Für dieses Restaurant sind keine Gerichte hinterlegt.</p>
            ) : (
              <MenuAccordion menu={data.menu} />
            ))}
        </div>
      </div>
    </div>
  );
}

// Speisekarte im Modal: je Kategorie ein natives <details>. Dadurch ist das
// Auf-/Zuklappen ohne eigenes JavaScript per Tastatur bedienbar und wird von
// Screenreadern als aufklappbarer Bereich angesagt – eigene ARIA-Attribute
// wären hier redundant. Offen ist anfangs die Tagesessen-Gruppe (Gerichte mit
// Wochentags-Bindung), sonst die erste Kategorie. Gerichte ohne Kategorie
// stehen ungefaltet oben, weil es für sie keine Überschrift zum Klicken gibt.
function MenuAccordion({ menu }) {
  const groups = groupByCategory(menu);
  const withoutCategory = groups.find(([category]) => !category)?.[1] || [];
  const categories = groups.filter(([category]) => category);
  const tagesessenIndex = categories.findIndex(([, items]) =>
    items.some((item) => item.weekdays && item.weekdays.length > 0)
  );
  const openIndex = tagesessenIndex >= 0 ? tagesessenIndex : 0;

  return (
    <div className="menu-list">
      {withoutCategory.length > 0 && (
        <div className="menu-group">
          {withoutCategory.map((item) => (
            <MenuReadonlyItem key={item.id} item={item} />
          ))}
        </div>
      )}
      {categories.map(([category, items], index) => (
        <details key={category} className="menu-accordion" open={index === openIndex}>
          <summary>
            <FontAwesomeIcon icon={faChevronRight} className="menu-accordion-chevron" />
            <span>{category}</span>
            <span className="menu-accordion-count">
              {items.length} {items.length === 1 ? 'Gericht' : 'Gerichte'}
            </span>
          </summary>
          <div className="menu-group menu-accordion-body">
            {items.map((item) => (
              <MenuReadonlyItem key={item.id} item={item} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function MenuReadonlyItem({ item }) {
  return (
    <div className="menu-readonly-item">
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
    </div>
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
          <b>
            <OrderItemsInline items={myOrder.items} />
          </b>
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

// Bestellte Gerichte im Fließtext („Deine Bestellung: …"), je Gericht mit
// vorangestellter Kategorie und durch Komma getrennt.
function OrderItemsInline({ items }) {
  const list = items || [];
  if (list.length === 0) return <>Unbekanntes Gericht</>;
  return list.map((it, i) => (
    <Fragment key={i}>
      {i > 0 && ', '}
      <ItemLabel item={it} />
    </Fragment>
  ));
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

// Phase 1 ist beendet, aber niemand hat abgestimmt: es wird bewusst kein
// Restaurant automatisch bestimmt (sonst gewönne willkürlich die erste Option).
function NoWinnerPanel({ data }) {
  return (
    <section className="card">
      <h2>Kein Abstimmungsergebnis</h2>
      <div className="notice">
        Es wurde für keinen Vorschlag abgestimmt – deshalb wurde <b>kein Restaurant</b>{' '}
        ausgewählt. Die Planung kann für diesen Tag noch manuell eines festlegen.
        {data.organizerName && (
          <>
            {' '}
            Organisation: <b>{data.organizerName}</b>.
          </>
        )}
      </div>
    </section>
  );
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
          <b>
            <OrderItemsInline items={data.myOrder.items} />
          </b>{' '}
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
