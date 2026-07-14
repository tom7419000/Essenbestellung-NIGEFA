import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  DAY_STATUS,
  ORDER_STATUS,
  fmtDateLong,
  fmtDateShort,
  fmtPrice,
  fmtTime,
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
            {detail.day.status !== 'closed' && (
              <div className="notice">
                Die Bestellphase läuft noch (Bestellschluss {fmtTime(detail.day.phase2Deadline)} Uhr) –
                diese Liste kann sich noch ändern.
              </div>
            )}
            {detail.winner?.phone && (
              <p className="muted">
                ☎ {detail.winner.phone}
                {detail.winner.website && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={detail.winner.website} target="_blank" rel="noreferrer">
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
                      <th className="num">Einzelpreis</th>
                      <th className="num">Summe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.summary.map((s, i) => (
                      <tr key={i}>
                        <td className="num">{s.count}×</td>
                        <td>{s.itemName}</td>
                        <td className="num">{fmtPrice(s.priceCents)}</td>
                        <td className="num">{fmtPrice(s.totalCents)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td className="num" colSpan={3}>
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
              <div className="row">
                <button className="btn" onClick={() => bulkStatus('bestellt')}>
                  Alle auf „Bestellt“
                </button>
                <button className="btn" onClick={() => bulkStatus('geliefert')}>
                  Alle auf „Geliefert“
                </button>
              </div>
            </div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {detail.orders.map((o) => (
                      <tr key={o.id} className={o.status === 'storniert' ? 'row-cancelled' : ''}>
                        <td>{o.userName}</td>
                        <td>{o.itemName || 'Unbekanntes Gericht'}</td>
                        <td className="num">{fmtPrice(o.priceCents)}</td>
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
                >
                  {detail.day.winningRestaurantId === r.id && '🏆 '}
                  {r.name}: {r.votes}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
