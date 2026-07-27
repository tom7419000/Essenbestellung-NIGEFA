import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEuroSign, faPaperPlane, faTruck } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ItemLabel from '../components/ItemLabel.jsx';
import {
  DAY_STATUS,
  ORDER_STATUS,
  ORGANIZER_SOURCE_LABELS,
  fmtDateLong,
  fmtDateShort,
  fmtPrice,
  fmtTime,
  safeHttpUrl,
  statusLabel,
} from '../format.js';

export default function OrganizerPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const path = user.role === 'admin' ? '/days' : '/my/organizer-days';
    api(path)
      .then((d) => {
        setDays(d.days);
        if (d.days.length > 0) {
          const today = d.days.find((x) => x.date === d.today);
          setSelectedId((today || d.days[0]).id);
        }
      })
      .catch((e) => setError(e.message));
  }, [user]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      setDetail(await api(`/days/${selectedId}/full`));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [selectedId]);

  useEffect(() => {
    setDetail(null);
    loadDetail();
    const timer = setInterval(loadDetail, 15_000);
    return () => clearInterval(timer);
  }, [loadDetail]);

  async function setStatus(orderId, status) {
    try {
      await api(`/orders/${orderId}/status`, { method: 'PATCH', body: { status } });
      await loadDetail();
    } catch (e) {
      setError(e.message);
    }
  }

  async function bulkStatus(status) {
    try {
      await api(`/days/${selectedId}/orders-status`, { method: 'PATCH', body: { status } });
      await loadDetail();
    } catch (e) {
      setError(e.message);
    }
  }

  async function setPaid(orderId, paid) {
    try {
      await api(`/orders/${orderId}/paid`, { method: 'PATCH', body: { paid } });
      await loadDetail();
    } catch (e) {
      setError(e.message);
    }
  }

  async function bulkPaid(paid) {
    try {
      await api(`/days/${selectedId}/orders-paid`, { method: 'PATCH', body: { paid } });
      await loadDetail();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !days) return <div className="alert">{error}</div>;
  if (!days) return <div className="page-loading">Lädt …</div>;

  if (days.length === 0) {
    return (
      <div className="card empty-state">
        <div className="empty-emoji">📋</div>
        <h2>Keine Organisation zugewiesen</h2>
        <p className="muted">Du bist aktuell für keinen Tag als Organisator eingetragen.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card page-head">
        <div>
          <h1>Bestellübersicht</h1>
          <p className="muted">Alle Bestellungen des Tages – inklusive Statusverwaltung.</p>
        </div>
        <label className="inline-select">
          Tag
          <select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {fmtDateShort(d.date)} · {DAY_STATUS[d.status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="alert">{error}</div>}
      {!detail ? (
        <div className="page-loading">Lädt …</div>
      ) : (
        <>
          <div className="card">
            <div className="row space-between">
              <h2>
                {fmtDateLong(detail.day.date)}
                {detail.winner && <> · {detail.winner.name}</>}
              </h2>
              <span className={`badge status-${detail.day.status}`}>{DAY_STATUS[detail.day.status]}</span>
            </div>
            <p className="muted">
              {detail.organizerName ? (
                <>
                  Organisation: <b>{detail.organizerName}</b>{' '}
                  <span className={`badge organizer-${detail.day.organizerSource || 'manuell'}`}>
                    {ORGANIZER_SOURCE_LABELS[detail.day.organizerSource] || 'zugewiesen'}
                  </span>
                </>
              ) : detail.day.organizerMode !== 'manuell' ? (
                'Organisation: wird noch bestimmt (freiwillige Meldung bzw. Zufallsauswahl).'
              ) : (
                'Organisation: nicht festgelegt.'
              )}
            </p>
            {detail.winner && !detail.winner.hasMenu && (
              <div className="notice">
                Für dieses Restaurant ist keine Speisekarte hinterlegt – Bestellungen werden
                individuell abgesprochen und tauchen hier nicht auf.
              </div>
            )}
            {detail.day.status !== 'closed' ? (
              <div className="notice">
                Die Bestellphase läuft noch (Bestellschluss {fmtTime(detail.day.phase2Deadline)} Uhr) –
                diese Liste kann sich noch ändern.
              </div>
            ) : (
              <div className="notice success">
                Die Bestellphase ist beendet – bitte jetzt die Sammelbestellung beim Restaurant
                aufgeben.
              </div>
            )}
            {detail.winner?.phone && (
              <p className="muted">
                ☎ {detail.winner.phone}
                {safeHttpUrl(detail.winner.website) && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={safeHttpUrl(detail.winner.website)} target="_blank" rel="noreferrer">
                      Website
                    </a>
                  </>
                )}
              </p>
            )}

            <h3>Sammelbestellung</h3>
            {detail.summary.length === 0 ? (
              <p className="muted">Noch keine Bestellungen.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="num">Anzahl</th>
                      <th>Gericht</th>
                      <th>Besteller</th>
                      <th className="num">Einzelpreis</th>
                      <th className="num">Summe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.summary.map((s, i) => (
                      <tr key={i}>
                        <td className="num">{s.count}×</td>
                        <td>
                          <ItemLabel item={s} />
                        </td>
                        <td className="orderers" title={(s.users || []).join(', ')}>
                          {(s.users || []).join(', ')}
                        </td>
                        <td className="num">{fmtPrice(s.priceCents)}</td>
                        <td className="num">{fmtPrice(s.totalCents)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td className="num" colSpan={4}>
                        Gesamt
                      </td>
                      <td className="num">{fmtPrice(detail.totalCents)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="row space-between wrap">
              <h3>Einzelbestellungen ({detail.orders.length})</h3>
              <div className="row wrap">
                <button className="btn" onClick={() => bulkStatus('bestellt')}>
                  <FontAwesomeIcon icon={faPaperPlane} /> Alle auf „Bestellt“
                </button>
                <button className="btn" onClick={() => bulkStatus('geliefert')}>
                  <FontAwesomeIcon icon={faTruck} /> Alle auf „Geliefert“
                </button>
                <button className="btn" onClick={() => bulkPaid(true)}>
                  <FontAwesomeIcon icon={faEuroSign} /> Alle als bezahlt
                </button>
              </div>
            </div>
            {detail.paidStats && detail.paidStats.totalCount > 0 && (
              <div className={`notice${detail.paidStats.paidCount === detail.paidStats.totalCount ? ' success' : ''}`}>
                Bezahlt: <b>{detail.paidStats.paidCount} von {detail.paidStats.totalCount}</b>
                {' '}({fmtPrice(detail.paidStats.paidCents)} erhalten
                {detail.paidStats.openCents > 0 && (
                  <>
                    , <b>{fmtPrice(detail.paidStats.openCents)} offen</b>
                  </>
                )}
                )
              </div>
            )}
            {detail.orders.length === 0 ? (
              <p className="muted">Noch keine Bestellungen.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Gericht</th>
                      <th className="num">Preis</th>
                      <th>Bemerkung</th>
                      <th>Status</th>
                      <th>Bezahlt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.orders.map((o) => (
                      <tr key={o.id} className={o.status === 'storniert' ? 'row-cancelled' : ''}>
                        <td>{o.userName}</td>
                        <td>
                          {o.items && o.items.length > 0 ? (
                            <ul className="order-item-list">
                              {o.items.map((it, i) => (
                                <li key={i}>
                                  <ItemLabel item={it} />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            'Unbekanntes Gericht'
                          )}
                        </td>
                        <td className="num">{fmtPrice(o.totalCents)}</td>
                        <td className="muted">{o.note || '–'}</td>
                        <td>
                          <select
                            className={`status-select order-${o.status}`}
                            value={o.status}
                            onChange={(e) => setStatus(o.id, e.target.value)}
                          >
                            {ORDER_STATUS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label className="checkbox paid-toggle" title="bezahlt / offen">
                            <input
                              type="checkbox"
                              checked={o.paid}
                              disabled={o.status === 'storniert'}
                              onChange={(e) => setPaid(o.id, e.target.checked)}
                            />
                            {o.paid ? (
                              <span className="badge badge-ok">bezahlt</span>
                            ) : (
                              <span className="badge badge-off">offen</span>
                            )}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Abstimmungsergebnis</h3>
            <div className="vote-result">
              {detail.restaurants.map((r) => (
                <span
                  key={r.id}
                  className={`votes-badge${detail.day.winningRestaurantId === r.id ? ' winner' : ''}`}
                  title={
                    r.voters?.length ? `Abgestimmt: ${r.voters.join(', ')}` : 'Noch keine Stimmen'
                  }
                >
                  {detail.day.winningRestaurantId === r.id && '🏆 '}
                  {r.name}: {r.votes}
                </span>
              ))}
            </div>
          </div>

          {(detail.participationOptions?.length ?? 0) > 0 && (
            <div className="card">
              <h3>Teilnahme ohne Bestellung</h3>
              <p className="muted">
                Unverbindliche Interessenslisten (z. B. Supermarkt) – zählen nicht zur
                Sammelbestellung oder zum Bezahlt-Status.
              </p>
              {detail.participationOptions.map((o) => (
                <div key={o.id} className="participation-summary">
                  <strong>
                    {o.name} · {o.count} {o.count === 1 ? 'Person' : 'Personen'}
                  </strong>
                  {o.count > 0 && <div className="muted">{o.participants.join(', ')}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
