import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faFloppyDisk, faPen, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api.js';
import { fmtPrice, parsePriceInput, priceInputValue } from '../../format.js';

const EMPTY_RESTAURANT = { name: '', description: '', phone: '', website: '' };
const EMPTY_ITEM = { name: '', description: '', price: '' };

export default function RestaurantsAdmin() {
  const [restaurants, setRestaurants] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState(EMPTY_RESTAURANT);

  async function load(keepSelection = true) {
    try {
      const d = await api('/restaurants?all=1');
      setRestaurants(d.restaurants);
      if (!keepSelection || !d.restaurants.some((r) => r.id === selectedId)) {
        setSelectedId(d.restaurants[0]?.id ?? null);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const d = await api('/restaurants', { method: 'POST', body: createForm });
      setCreateForm(EMPTY_RESTAURANT);
      await load();
      setSelectedId(d.restaurant.id);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!restaurants) return <div className="page-loading">Lädt …</div>;

  return (
    <div className="stack">
      <div className="card">
        <h1>Restaurants verwalten</h1>
        {error && <div className="alert">{error}</div>}
      </div>
      <div className="two-col">
        <div className="stack">
          <div className="card">
            <h2>Restaurants</h2>
            <ul className="select-list">
              {restaurants.map((r) => (
                <li key={r.id}>
                  <button
                    className={`select-list-item${selectedId === r.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span>
                      {r.name}
                      {!r.isActive && <span className="badge badge-off">deaktiviert</span>}
                    </span>
                    <span className="muted">{r.menuCount} Gerichte</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2>Neues Restaurant</h2>
            <form className="stack" onSubmit={create}>
              <label>
                Name
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Beschreibung
                <input
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </label>
              <label>
                Telefon
                <input
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                />
              </label>
              <label>
                Website / Speisekarte (URL)
                <input
                  value={createForm.website}
                  onChange={(e) => setCreateForm({ ...createForm, website: e.target.value })}
                />
              </label>
              <div>
                <button className="btn btn-primary">
                  <FontAwesomeIcon icon={faPlus} /> Anlegen
                </button>
              </div>
            </form>
          </div>
        </div>

        {selectedId ? (
          <RestaurantEditor
            key={selectedId}
            restaurantId={selectedId}
            onChanged={load}
            onError={setError}
          />
        ) : (
          <div className="card empty-state">
            <p className="muted">Noch keine Restaurants angelegt.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RestaurantEditor({ restaurantId, onChanged, onError }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemEdit, setItemEdit] = useState(null);

  async function load() {
    const d = await api(`/restaurants/${restaurantId}/menu?all=1`);
    setData(d);
    setForm({
      name: d.restaurant.name,
      description: d.restaurant.description,
      phone: d.restaurant.phone,
      website: d.restaurant.website,
      isActive: d.restaurant.isActive,
    });
  }

  useEffect(() => {
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function save(e) {
    e.preventDefault();
    onError('');
    try {
      await api(`/restaurants/${restaurantId}`, { method: 'PUT', body: form });
      await load();
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  async function removeRestaurant() {
    if (!window.confirm(`Restaurant „${data.restaurant.name}“ löschen bzw. deaktivieren?`)) return;
    onError('');
    try {
      const d = await api(`/restaurants/${restaurantId}`, { method: 'DELETE' });
      if (d.message) window.alert(d.message);
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  async function addItem(e) {
    e.preventDefault();
    onError('');
    const priceCents = parsePriceInput(itemForm.price);
    if (priceCents === undefined) {
      onError('Ungültiger Preis – bitte z. B. „8,50“ eingeben.');
      return;
    }
    try {
      await api(`/restaurants/${restaurantId}/menu`, {
        method: 'POST',
        body: { name: itemForm.name, description: itemForm.description, priceCents },
      });
      setItemForm(EMPTY_ITEM);
      await load();
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  function startItemEdit(item) {
    setEditingItemId(item.id);
    setItemEdit({
      name: item.name,
      description: item.description,
      price: priceInputValue(item.priceCents),
      isActive: item.isActive,
    });
  }

  async function saveItemEdit(id) {
    onError('');
    const priceCents = parsePriceInput(itemEdit.price);
    if (priceCents === undefined) {
      onError('Ungültiger Preis – bitte z. B. „8,50“ eingeben.');
      return;
    }
    try {
      await api(`/menu-items/${id}`, {
        method: 'PUT',
        body: {
          name: itemEdit.name,
          description: itemEdit.description,
          priceCents,
          isActive: itemEdit.isActive,
        },
      });
      setEditingItemId(null);
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`Gericht „${item.name}“ löschen bzw. deaktivieren?`)) return;
    onError('');
    try {
      const d = await api(`/menu-items/${item.id}`, { method: 'DELETE' });
      if (d.message) window.alert(d.message);
      await load();
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  if (!data || !form) return <div className="card page-loading">Lädt …</div>;

  return (
    <div className="stack">
      <div className="card">
        <div className="row space-between">
          <h2>{data.restaurant.name}</h2>
          <button className="btn btn-danger-ghost btn-sm" onClick={removeRestaurant}>
            <FontAwesomeIcon icon={faTrash} /> Löschen / Deaktivieren
          </button>
        </div>
        <form className="form-grid" onSubmit={save}>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Telefon
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="span-2">
            Beschreibung
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="span-2">
            Website / Speisekarte (URL)
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            aktiv (steht für neue Tage zur Auswahl)
          </label>
          <div className="form-actions">
            <button className="btn btn-primary">
              <FontAwesomeIcon icon={faFloppyDisk} /> Speichern
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Speisekarte</h3>
        {data.items.length === 0 && <p className="muted">Noch keine Gerichte angelegt.</p>}
        {data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Gericht</th>
                  <th>Beschreibung</th>
                  <th className="num">Preis</th>
                  <th>Status</th>
                  <th className="actions">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) =>
                  editingItemId === item.id ? (
                    <tr key={item.id}>
                      <td>
                        <input
                          value={itemEdit.name}
                          onChange={(e) => setItemEdit({ ...itemEdit, name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={itemEdit.description}
                          onChange={(e) => setItemEdit({ ...itemEdit, description: e.target.value })}
                        />
                      </td>
                      <td className="num">
                        <input
                          className="input-price"
                          value={itemEdit.price}
                          onChange={(e) => setItemEdit({ ...itemEdit, price: e.target.value })}
                          placeholder="8,50"
                        />
                      </td>
                      <td>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={itemEdit.isActive}
                            onChange={(e) => setItemEdit({ ...itemEdit, isActive: e.target.checked })}
                          />
                          aktiv
                        </label>
                      </td>
                      <td className="actions">
                        <button className="btn btn-primary btn-sm" onClick={() => saveItemEdit(item.id)}>
                          <FontAwesomeIcon icon={faCheck} /> Speichern
                        </button>
                        <button className="btn btn-sm" onClick={() => setEditingItemId(null)}>
                          <FontAwesomeIcon icon={faXmark} /> Abbrechen
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td className="muted">{item.description || '–'}</td>
                      <td className="num">{fmtPrice(item.priceCents)}</td>
                      <td>
                        {item.isActive ? (
                          <span className="badge badge-ok">aktiv</span>
                        ) : (
                          <span className="badge badge-off">deaktiviert</span>
                        )}
                      </td>
                      <td className="actions">
                        <button className="btn btn-sm" onClick={() => startItemEdit(item)}>
                          <FontAwesomeIcon icon={faPen} /> Bearbeiten
                        </button>
                        <button className="btn btn-danger-ghost btn-sm" onClick={() => removeItem(item)}>
                          <FontAwesomeIcon icon={faTrash} /> Löschen
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        <h4>Gericht hinzufügen</h4>
        <form className="row wrap" onSubmit={addItem}>
          <input
            placeholder="Gericht"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            required
          />
          <input
            placeholder="Beschreibung (optional)"
            value={itemForm.description}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
          />
          <input
            className="input-price"
            placeholder="Preis, z. B. 8,50"
            value={itemForm.price}
            onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
          />
          <button className="btn btn-primary">
            <FontAwesomeIcon icon={faPlus} /> Hinzufügen
          </button>
        </form>
      </div>
    </div>
  );
}
