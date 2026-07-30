import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBan, faCheck, faLockOpen, faPen, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const EMPTY_FORM = { username: '', displayName: '', password: '', role: 'user' };

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(null);

  async function load() {
    try {
      setUsers((await api('/users')).users);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/users', { method: 'POST', body: form });
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEdit({ displayName: u.displayName, role: u.role, isActive: u.isActive, password: '' });
  }

  async function saveEdit(id) {
    setError('');
    try {
      const body = { ...edit };
      if (!body.password) delete body.password;
      await api(`/users/${id}`, { method: 'PUT', body });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Sperren macht laufende Sitzungen sofort ungültig – deshalb der Hinweis
  // in der Rückfrage.
  async function toggleBlocked(u) {
    const question = u.isBlocked
      ? `Sperre für „${u.displayName}“ aufheben?`
      : `„${u.displayName}“ sperren? Anmeldung (auch per SSO) und laufende Sitzungen werden sofort gesperrt.`;
    if (!window.confirm(question)) return;
    setError('');
    try {
      await api(`/users/${u.id}/blocked`, { method: 'PATCH', body: { blocked: !u.isBlocked } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(u) {
    if (!window.confirm(`Benutzer „${u.displayName}“ wirklich löschen? Stimmen und Bestellungen werden mitgelöscht.`)) {
      return;
    }
    setError('');
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!users) return <div className="page-loading">Lädt …</div>;

  return (
    <div className="stack">
      <div className="card">
        <h1>Benutzer verwalten</h1>
        <p className="muted role-hint">
          <strong>Benutzer:</strong> abstimmen &amp; bestellen. <strong>Planung:</strong>{' '}
          zusätzlich Tage anlegen, bearbeiten und absagen sowie die Planungs-Standardzeiten –
          ohne Zugriff auf Benutzer-, Restaurant-, Design- oder SSO-Verwaltung.{' '}
          <strong>Admin:</strong> vollständige Verwaltung.
        </p>
        {error && <div className="alert">{error}</div>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Benutzername</th>
                <th>Anzeigename</th>
                <th>Rolle</th>
                <th>Status</th>
                <th>Neues Passwort</th>
                <th className="actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) =>
                editingId === u.id ? (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>
                      <input
                        value={edit.displayName}
                        onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={edit.role}
                        onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                        disabled={u.id === me.id}
                      >
                        <option value="user">Benutzer</option>
                        <option value="planung">Planung</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={edit.isActive}
                          disabled={u.id === me.id}
                          onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
                        />
                        aktiv
                      </label>
                    </td>
                    <td>
                      <input
                        type="password"
                        placeholder="unverändert"
                        value={edit.password}
                        onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                        autoComplete="new-password"
                      />
                    </td>
                    <td className="actions">
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(u.id)}>
                        <FontAwesomeIcon icon={faCheck} /> Speichern
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditingId(null)}>
                        <FontAwesomeIcon icon={faXmark} /> Abbrechen
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.displayName}</td>
                    <td>
                      {u.role === 'admin' ? (
                        <span className="badge badge-admin">Admin</span>
                      ) : u.role === 'planung' ? (
                        <span className="badge badge-plan">Planung</span>
                      ) : (
                        'Benutzer'
                      )}
                    </td>
                    <td>
                      {u.isBlocked ? (
                        <span className="badge badge-blocked">gesperrt</span>
                      ) : u.isActive ? (
                        <span className="badge badge-ok">aktiv</span>
                      ) : (
                        <span className="badge badge-off">deaktiviert</span>
                      )}
                    </td>
                    <td className="muted">••••••</td>
                    <td className="actions">
                      <button className="btn btn-sm" onClick={() => startEdit(u)}>
                        <FontAwesomeIcon icon={faPen} /> Bearbeiten
                      </button>
                      {u.id !== me.id && (
                        <button
                          className={`btn btn-sm${u.isBlocked ? '' : ' btn-danger-ghost'}`}
                          onClick={() => toggleBlocked(u)}
                        >
                          <FontAwesomeIcon icon={u.isBlocked ? faLockOpen : faBan} />{' '}
                          {u.isBlocked ? 'Entsperren' : 'Sperren'}
                        </button>
                      )}
                      {u.id !== me.id && (
                        <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(u)}>
                          <FontAwesomeIcon icon={faTrash} /> Löschen
                        </button>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Neuen Benutzer anlegen</h2>
        <form className="form-grid" onSubmit={create}>
          <label>
            Benutzername
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Anzeigename
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
            />
          </label>
          <label>
            Passwort
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Rolle
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Benutzer</option>
              <option value="planung">Planung</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="btn btn-primary">
              <FontAwesomeIcon icon={faPlus} /> Anlegen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
