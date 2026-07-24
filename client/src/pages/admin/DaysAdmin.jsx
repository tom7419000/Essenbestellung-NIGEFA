import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faCheck,
  faEye,
  faEyeSlash,
  faFloppyDisk,
  faPen,
  faPlus,
  faRobot,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api.js';

const AUTO_WEEKDAYS = [
  { n: 1, label: 'Montag' },
  { n: 2, label: 'Dienstag' },
  { n: 3, label: 'Mittwoch' },
  { n: 4, label: 'Donnerstag' },
  { n: 5, label: 'Freitag' },
];
import {
  DAY_STATUS,
  ORGANIZER_MODES,
  ORGANIZER_SOURCE_LABELS,
  fmtDateShort,
  fmtPrice,
  fmtTime,
  organizerModeLabel,
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
      organizerMode: s?.defaultOrganizerMode ?? 'manuell',
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
        api('/users/selectable'),
        api('/settings'),
      ]);
      setDays(d.days);
      setRestaurants(r.restaurants);
      setUsers(u.users);
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
        organizerId: day.organizerSource === 'manuell' ? (day.organizerId ?? '') : '',
        organizerMode: day.organizerMode ?? 'manuell',
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
      organizerMode: form.organizerMode,
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
              Organisator-Modus
              <select
                value={form.organizerMode}
                onChange={(e) => setForm({ ...form, organizerMode: e.target.value })}
              >
                {ORGANIZER_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {form.organizerMode === 'manuell' ? (
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
            ) : (
              <label>
                Organisator
                <input
                  value={
                    form.organizerMode === 'freiwillig'
                      ? 'per freiwilliger Meldung (Fallback: Zufall)'
                      : 'wird zufällig bestimmt'
                  }
                  disabled
                />
              </label>
            )}
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
                  {!r.hasMenu && <span className="badge badge-off">ohne Speisekarte</span>}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <button className="btn btn-primary">
              <FontAwesomeIcon icon={editingId ? faCheck : faPlus} />{' '}
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
                <FontAwesomeIcon icon={faXmark} /> Abbrechen
              </button>
            )}
          </div>
        </form>
      </div>

      <AutoPlanCard restaurants={restaurants} onGenerated={loadDays} />

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
                    <td>
                      {fmtDateShort(d.date)}
                      {d.autoCreated && (
                        <span className="badge badge-auto" title="Automatisch erstellt">
                          <FontAwesomeIcon icon={faRobot} /> auto
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge status-${d.status}`}>{DAY_STATUS[d.status]}</span>
                    </td>
                    <td>{fmtTime(d.phase1Deadline)}</td>
                    <td>{fmtTime(d.phase2Deadline)}</td>
                    <td>
                      {d.organizerName ? (
                        <>
                          {d.organizerName}
                          {d.organizerSource && d.organizerSource !== 'manuell' && (
                            <small className="muted" style={{ display: 'block' }}>
                              {ORGANIZER_SOURCE_LABELS[d.organizerSource]}
                            </small>
                          )}
                        </>
                      ) : d.organizerMode !== 'manuell' ? (
                        <span className="muted">
                          {d.organizerMode === 'freiwillig' ? 'Freiwillige gesucht' : 'Zufall'}
                        </span>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td>{d.winnerName || '–'}</td>
                    <td className="num">{d.voteCount}</td>
                    <td className="num">{d.orderCount}</td>
                    <td className="actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => setDetailId(detailId === d.id ? null : d.id)}
                      >
                        <FontAwesomeIcon icon={detailId === d.id ? faEyeSlash : faEye} />{' '}
                        {detailId === d.id ? 'Details ausblenden' : 'Details'}
                      </button>
                      <button className="btn btn-sm" onClick={() => startEdit(d)}>
                        <FontAwesomeIcon icon={faPen} /> Bearbeiten
                      </button>
                      <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(d)}>
                        <FontAwesomeIcon icon={faTrash} /> Löschen
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
          <h2>Standardeinstellungen</h2>
          <p className="muted">
            Vorbelegung für neue Tage sowie der Zeitpunkt, zu dem bei freiwilliger Meldung ohne
            Kandidat bzw. im Zufallsmodus automatisch ein Organisator aus den Mitbestellern
            bestimmt wird.
          </p>
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
            <label className="inline-select">
              Organisator-Modus (Standard)
              <select
                value={settings.defaultOrganizerMode}
                onChange={(e) => setSettings({ ...settings, defaultOrganizerMode: e.target.value })}
              >
                {ORGANIZER_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-select">
              Zuweisung
              <select
                value={String(settings.organizerAssignMinutes)}
                onChange={(e) =>
                  setSettings({ ...settings, organizerAssignMinutes: Number(e.target.value) })
                }
              >
                <option value="0">zum Bestellschluss</option>
                <option value="5">5 Min. vor Bestellschluss</option>
                <option value="10">10 Min. vor Bestellschluss</option>
                <option value="15">15 Min. vor Bestellschluss</option>
                <option value="30">30 Min. vor Bestellschluss</option>
                <option value="60">60 Min. vor Bestellschluss</option>
              </select>
            </label>
            <button className="btn btn-primary">
              <FontAwesomeIcon icon={faFloppyDisk} /> Speichern
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function AutoPlanCard({ restaurants, onGenerated }) {
  const [config, setConfig] = useState(null);
  const [holidaysText, setHolidaysText] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/days/auto-plan')
      .then((d) => {
        setConfig(d.config);
        setHolidaysText((d.config.holidays || []).join('\n'));
      })
      .catch((e) => setError(e.message));
  }, []);

  function patch(p) {
    setConfig((c) => ({ ...c, ...p }));
  }
  function setWeekday(n, wp) {
    setConfig((c) => ({
      ...c,
      weekdays: { ...c.weekdays, [n]: { ...(c.weekdays[n] || {}), ...wp } },
    }));
  }
  function toggleWdRestaurant(n, rid) {
    const cur = config.weekdays[n]?.restaurantIds || [];
    setWeekday(n, {
      restaurantIds: cur.includes(rid) ? cur.filter((x) => x !== rid) : [...cur, rid],
    });
  }

  async function persist() {
    const holidays = holidaysText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const d = await api('/days/auto-plan', { method: 'PUT', body: { ...config, holidays } });
    setConfig(d.config);
    setHolidaysText((d.config.holidays || []).join('\n'));
    return d.config;
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await persist();
      setMsg('Konfiguration gespeichert.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAndRun() {
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await persist();
      const r = await api('/days/auto-plan/run', { method: 'POST' });
      if (!r.enabled) {
        setMsg('Gespeichert. Die Automatik ist deaktiviert – es wurden keine Tage erzeugt.');
      } else if (r.created.length === 0) {
        setMsg('Gespeichert. Keine neuen Tage nötig – alle geplanten Tage existieren bereits.');
      } else {
        setMsg(`Gespeichert. ${r.created.length} Tag(e) erzeugt: ${r.created.join(', ')}.`);
      }
      await onGenerated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !config) return <div className="card alert">{error}</div>;
  if (!config) return <div className="card page-loading">Lädt …</div>;

  const menuRestaurants = restaurants; // aktive Restaurants aus der Elternkomponente

  return (
    <div className="card">
      <h2>
        <FontAwesomeIcon icon={faRobot} /> Automatische Tagesplanung
      </h2>
      <p className="muted">
        Legt werktags (Mo–Fr) automatisch Tage im Voraus an. Wochenenden werden ausgelassen,
        Feiertage/Ausnahmen pflegst du unten als Datumsliste. Bereits geplante Tage bleiben
        unangetastet und lassen sich weiterhin manuell bearbeiten.
      </p>
      {error && <div className="alert">{error}</div>}
      {msg && <div className="notice">{msg}</div>}

      <form className="stack" onSubmit={save}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          Automatische Tagesplanung aktiv
        </label>

        <div className="form-grid">
          <label>
            Vorlauf (Tage im Voraus)
            <input
              type="number"
              min={1}
              max={60}
              value={config.daysAhead}
              onChange={(e) => patch({ daysAhead: Number(e.target.value) })}
            />
          </label>
          <label>
            Organisator-Modus
            <select
              value={config.organizerMode}
              onChange={(e) => patch({ organizerMode: e.target.value })}
            >
              {ORGANIZER_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ende Restaurantwahl (Phase 1)
            <input
              type="time"
              value={config.phase1Time}
              onChange={(e) => patch({ phase1Time: e.target.value })}
            />
          </label>
          <label>
            Bestellschluss (Phase 2)
            <input
              type="time"
              value={config.phase2Time}
              onChange={(e) => patch({ phase2Time: e.target.value })}
            />
          </label>
        </div>

        <fieldset className="restaurant-picker">
          <legend>Restaurants je Wochentag</legend>
          {menuRestaurants.length === 0 && <p className="muted">Bitte zuerst Restaurants anlegen.</p>}
          <div className="auto-weekdays">
            {AUTO_WEEKDAYS.map((wd) => {
              const wdCfg = config.weekdays[wd.n] || { mode: 'fest', restaurantIds: [] };
              return (
                <div key={wd.n} className="auto-weekday">
                  <div className="auto-weekday-head">
                    <strong>{wd.label}</strong>
                    <label className="inline-select">
                      Modus
                      <select
                        value={wdCfg.mode}
                        onChange={(e) => setWeekday(wd.n, { mode: e.target.value })}
                      >
                        <option value="fest">fest (immer diese Auswahl)</option>
                        <option value="rotierend">rotierend (reihum ein Restaurant)</option>
                      </select>
                    </label>
                  </div>
                  <div className="checkbox-grid">
                    {menuRestaurants.map((r) => (
                      <label key={r.id} className="checkbox">
                        <input
                          type="checkbox"
                          checked={(wdCfg.restaurantIds || []).includes(r.id)}
                          onChange={() => toggleWdRestaurant(wd.n, r.id)}
                        />
                        {r.name}
                        {!r.hasMenu && <span className="badge badge-off">ohne Speisekarte</span>}
                      </label>
                    ))}
                  </div>
                  {wdCfg.mode === 'rotierend' && (wdCfg.restaurantIds || []).length > 1 && (
                    <p className="muted auto-rotation-hint">
                      Rotiert je Woche in Auswahlreihenfolge durch:{' '}
                      {wdCfg.restaurantIds
                        .map((id) => menuRestaurants.find((r) => r.id === id)?.name)
                        .filter(Boolean)
                        .join(' → ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <label>
          Feiertage / Ausnahmen (ein Datum je Zeile, JJJJ-MM-TT)
          <textarea
            className="holidays-input"
            rows={4}
            placeholder={'2026-12-24\n2026-12-25\n2026-12-31'}
            value={holidaysText}
            onChange={(e) => setHolidaysText(e.target.value)}
          />
        </label>

        <div className="row">
          <button className="btn btn-primary" disabled={busy}>
            <FontAwesomeIcon icon={faFloppyDisk} /> Speichern
          </button>
          <button type="button" className="btn" disabled={busy} onClick={saveAndRun}>
            <FontAwesomeIcon icon={faBolt} /> Speichern &amp; jetzt erzeugen
          </button>
        </div>
      </form>
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
      {detail.summary.length > 0 && (
        <>
          <h3>Sammelbestellung</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Anzahl</th>
                  <th>Gericht</th>
                  <th>Besteller</th>
                  <th className="num">Summe</th>
                </tr>
              </thead>
              <tbody>
                {detail.summary.map((s, i) => (
                  <tr key={i}>
                    <td className="num">{s.count}×</td>
                    <td>{s.itemName}</td>
                    <td className="orderers" title={(s.users || []).join(', ')}>
                      {(s.users || []).join(', ')}
                    </td>
                    <td className="num">{fmtPrice(s.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
