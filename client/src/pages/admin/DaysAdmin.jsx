import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import {
  DAY_STATUS,
  fmtDateShort,
  fmtPrice,
  fmtTime,
  statusLabel,
  timeInputValue,
} from '../../format.js';

function todayLocal() {
  return new Date().toLocaleDateString('sv-SE');
}

export default function DaysAdmin() {
  const [days, setDays] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);

  function emptyForm(s) {
    return {
      date: todayLocal(),
      organizerId: '',
      phase1Time: s?.defaultPhase1Time ?? '10:30',
      phase2Time: s?.defaultPhase2Time ?? '11:45',
      restaurantIds: [],
    };
  }

  async function loadAll() {
    try {
      const [d, r, u, s] = await Promise.all([
        api('/days'),
        api('/restaurants'),
        api('/users'),
        api('/settings'),
      ]);
      setDays(d.days);
      setRestaurants(r.restaurants);
      setUsers(u.users.filter((x) => x.isActive));
      setSettings(s);
      setForm((prev) => prev ?? emptyForm(s));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDays() {
    setDays((await api('/days')).days);
  }

  function toggleRestaurant(id) {
    setForm((f) => ({
      ...f,
      restaurantIds: f.restaurantIds.includes(id)
        ? f.restaurantIds.filter((x) => x !== id)
        : [...f.restaurantIds, id],
    }));
  }

  async function startEdit(day) {
    setError('');
    try {
      const full = await api(`/days/${day.id}/full`);
      setEditingId(day.id);
      setForm({
        date: day.date,
        organizerId: day.organizerId ?? '',
        phase1Time: timeInputValue(day.phase1Deadline),
        phase2Time: timeInputValue(day.phase2Deadline),
        restaurantIds: full.restaurants.map((r) => r.id),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const body = {
      date: form.date,
      organizerId: form.organizerId === '' ? null : Number(form.organizerId),
      phase1Deadline: new Date(`${form.date}T${form.phase1Time}`).toISOString(),
      phase2Deadline: new Date(`${form.date}T${form.phase2Time}`).toISOString(),
      restaurantIds: form.restaurantIds,
    };
    try {
      if (editingId) {
        await api(`/days/${editingId}`, { method: 'PUT', body });
      } else {
        await api('/days', { method: 'POST', body });
      }
      setEditingId(null);
      setForm(emptyForm(settings));
      await loadDays();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(day) {
    if (
      !window.confirm(
        `Planung für ${fmtDateShort(day.date)} wirklich löschen? Stimmen und Bestellungen werden mitgelöscht.`
      )
    ) {
      return;
    }
    setError('');
    try {
      await api(`/days/${day.id}`, { method: 'DELETE' });
      if (detailId === day.id) setDetailId(null);
      await loadDays();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/settings', { method: 'PUT', body: settings });
    } catch (err) {
      setError(err.message);
    }
  }

  if (!days || !form) return <div className="page-loading">Lädt …</div>;

  return (
    <div className="stack">
      <div className="card">
        <h1>Tagesplanung</h1>
        <p className="muted">
          Lege für jeden Tag fest, welche Restaurants zur Wahl stehen, wer organisiert und wann die
          Abstimmungen enden.
        </p>
        {error && <div className="alert">{error}</div>}
      </div>

      <div className="card">
        <h2>{editingId ? `Planung bearbeiten (${fmtDateShort(form.date)})` : 'Neuen Tag planen'}</h2>
        <form className="stack" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Datum
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </label>
            <label>
              Organisator
              <select
                value={form.organizerId}
                onChange={(e) => setForm({ ...form, organizerId: e.target.value })}
              >
                <option value="">– niemand –</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ende Restaurantwahl (Phase 1)
              <input
                type="time"
                value={form.phase1Time}
                onChange={(e) => setForm({ ...form, phase1Time: e.target.value })}
                required
              />
            </label>
            <label>
              Bestellschluss (Phase 2)
              <input
                type="time"
                value={form.phase2Time}
                onChange={(e) => setForm({ ...form, phase2Time: e.target.value })}
                required
              />
            </label>
          </div>
          <fieldset className="restaurant-picker">
            <legend>Restaurants zur Auswahl ({form.restaurantIds.length} gewählt)</legend>
            {restaurants.length === 0 && (
              <p className="muted">Bitte zuerst Restaurants anlegen.</p>
            )}
            <div className="checkbox-grid">
              {restaurants.map((r) => (
                <label key={r.id} className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.restaurantIds.includes(r.id)}
                    onChange={() => toggleRestaurant(r.id)}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <button className="btn btn-primary">
              {editingId ? 'Änderungen speichern' : 'Tag anlegen'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm(settings));
                }}
              >
                Abbrechen
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Geplante Tage</h2>
        {days.length === 0 ? (
          <p className="muted">Noch keine Tage geplant.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Status</th>
                  <th>Phase 1 bis</th>
                  <th>Phase 2 bis</th>
                  <th>Organisator</th>
                  <th>Gewinner</th>
                  <th className="num">Stimmen</th>
                  <th className="num">Bestellungen</th>
                  <th className="actions">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtDateShort(d.date)}</td>
                    <td>
                      <span className={`badge status-${d.status}`}>{DAY_STATUS[d.status]}</span>
                    </td>
                    <td>{fmtTime(d.phase1Deadline)}</td>
                    <td>{fmtTime(d.phase2Deadline)}</td>
                    <td>{d.organizerName || '–'}</td>
                    <td>{d.winnerName || '–'}</td>
                    <td className="num">{d.voteCount}</td>
                    <td className="num">{d.orderCount}</td>
                    <td className="actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => setDetailId(detailId === d.id ? null : d.id)}
                      >
                        {detailId === d.id ? 'Details ausblenden' : 'Details'}
                      </button>
                      <button className="btn btn-sm" onClick={() => startEdit(d)}>
                        Bearbeiten
                      </button>
                      <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(d)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {detailId && <DayDetail dayId={detailId} />}
      </div>

      {settings && (
        <div className="card">
          <h2>Standard-Abstimmungszeiten</h2>
          <p className="muted">Vorbelegung für neue Tage.</p>
          <form className="row wrap" onSubmit={saveSettings}>
            <label className="inline-select">
              Ende Phase 1
              <input
                type="time"
                value={settings.defaultPhase1Time}
                onChange={(e) => setSettings({ ...settings, defaultPhase1Time: e.target.value })}
              />
            </label>
            <label className="inline-select">
              Ende Phase 2
              <input
                type="time"
                value={settings.defaultPhase2Time}
                onChange={(e) => setSettings({ ...settings, defaultPhase2Time: e.target.value })}
              />
            </label>
            <button className="btn btn-primary">Speichern</button>
          </form>
        </div>
      )}
    </div>
  );
}

function DayDetail({ dayId }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDetail(null);
    api(`/days/${dayId}/full`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [dayId]);

  if (error) return <div className="alert">{error}</div>;
  if (!detail) return <div className="page-loading">Lädt …</div>;

  return (
    <div className="day-detail">
      <h3>Abstimmung</h3>
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
      <h3>
        Bestellungen ({detail.orders.length}) – Gesamt {fmtPrice(detail.totalCents)}
      </h3>
      {detail.orders.length === 0 ? (
        <p className="muted">Keine Bestellungen.</p>
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
                    <span className={`badge order-${o.status}`}>{statusLabel(o.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
