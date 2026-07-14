import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faDownload,
  faFileImport,
  faFloppyDisk,
  faPen,
  faPlus,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api.js';
import { fmtPrice, parsePriceInput, priceInputValue } from '../../format.js';

const EMPTY_RESTAURANT = { name: '', description: '', phone: '', website: '', hasMenu: true };
const EMPTY_ITEM = { name: '', category: '', description: '', price: '', allergens: '' };

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
                    <span className="muted">
                      {r.hasMenu ? `${r.menuCount} Gerichte` : 'ohne Speisekarte'}
                    </span>
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
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={createForm.hasMenu}
                  onChange={(e) => setCreateForm({ ...createForm, hasMenu: e.target.checked })}
                />
                Speisekarte vorhanden (Bestellungen über das Portal möglich)
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
      hasMenu: d.restaurant.hasMenu,
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
        body: {
          name: itemForm.name,
          category: itemForm.category,
          description: itemForm.description,
          allergens: itemForm.allergens,
          priceCents,
        },
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
      category: item.category || '',
      description: item.description,
      allergens: item.allergens || '',
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
          category: itemEdit.category,
          description: itemEdit.description,
          allergens: itemEdit.allergens,
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
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.hasMenu}
              onChange={(e) => setForm({ ...form, hasMenu: e.target.checked })}
            />
            Speisekarte vorhanden (Bestellungen über das Portal möglich)
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
        {!data.restaurant.hasMenu && (
          <div className="notice">
            „Speisekarte vorhanden“ ist deaktiviert – Benutzer sehen den Hinweis, individuell zu
            bestellen. Hier hinterlegte Gerichte werden nicht angezeigt, bleiben aber erhalten.
          </div>
        )}
        {data.items.length === 0 && <p className="muted">Noch keine Gerichte angelegt.</p>}
        {data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Gericht</th>
                  <th>Kategorie</th>
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
                        <input
                          value={itemEdit.allergens}
                          onChange={(e) => setItemEdit({ ...itemEdit, allergens: e.target.value })}
                          placeholder="Allergene (optional)"
                          style={{ marginTop: '0.3rem' }}
                        />
                      </td>
                      <td>
                        <input
                          value={itemEdit.category}
                          onChange={(e) => setItemEdit({ ...itemEdit, category: e.target.value })}
                          placeholder="z. B. Pizza"
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
                      <td>
                        {item.name}
                        {item.allergens && (
                          <small className="muted" style={{ display: 'block' }}>
                            Allergene: {item.allergens}
                          </small>
                        )}
                      </td>
                      <td className="muted">{item.category || '–'}</td>
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
            placeholder="Kategorie (optional)"
            value={itemForm.category}
            onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
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
          <input
            placeholder="Allergene (optional)"
            value={itemForm.allergens}
            onChange={(e) => setItemForm({ ...itemForm, allergens: e.target.value })}
          />
          <button className="btn btn-primary">
            <FontAwesomeIcon icon={faPlus} /> Hinzufügen
          </button>
        </form>
      </div>

      <CsvImportCard restaurantId={restaurantId} onDone={async () => { await load(); await onChanged(); }} onError={onError} />
    </div>
  );
}

const CSV_TEMPLATE = [
  'Kategorie;Name;Beschreibung;Preis;Allergene',
  'Pizza;Pizza Margherita;"Tomaten, Mozzarella, Basilikum";8,50;G',
  'Pizza;Pizza Salami;"Tomaten, Mozzarella, Salami";9,50;"G,2,3"',
  'Salate;Gemischter Salat;Mit Balsamico-Dressing;7,20;',
  '',
].join('\n');

function CsvImportCard({ restaurantId, onDone, onError }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('append');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  function downloadTemplate() {
    const blob = new Blob(['\uFEFF' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'speisekarte-vorlage.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onError('');
    setResult(null);
    setBusy(true);
    try {
      const csv = await file.text();
      const r = await api(`/restaurants/${restaurantId}/menu/import-csv`, {
        method: 'POST',
        body: { csv, mode },
      });
      setResult(r);
      await onDone();
    } catch (err) {
      onError(err.message);
      if (err.status === 400 && err.message) setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Speisekarte per CSV importieren</h3>
      <p className="muted">
        Kopfzeile erforderlich: <code>Kategorie;Name;Beschreibung;Preis;Allergene</code> – nur
        „Name“ ist Pflicht, Trennzeichen Semikolon oder Komma, Preis z. B. „8,50“. Fehlerhafte
        Zeilen werden übersprungen und unten aufgelistet.
      </p>
      <div className="row wrap">
        <label className="checkbox">
          <input type="radio" name="csvmode" checked={mode === 'append'} onChange={() => setMode('append')} />
          Ergänzen (gleichnamige Gerichte aktualisieren)
        </label>
        <label className="checkbox">
          <input type="radio" name="csvmode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
          Ersetzen (nicht enthaltene Gerichte entfernen)
        </label>
      </div>
      <div className="row wrap" style={{ marginTop: '0.6rem' }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={importFile} hidden />
        <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current.click()}>
          <FontAwesomeIcon icon={faFileImport} /> CSV-Datei wählen …
        </button>
        <button className="btn" onClick={downloadTemplate}>
          <FontAwesomeIcon icon={faDownload} /> Vorlage herunterladen
        </button>
      </div>
      {result && (
        <>
          <div className="notice success">
            Import abgeschlossen: {result.created} neu, {result.updated} aktualisiert
            {result.mode === 'replace' && (
              <>, {result.removed} entfernt, {result.deactivated} deaktiviert</>
            )}
            .{result.errors.length > 0 && <> {result.errors.length} Zeile(n) übersprungen:</>}
          </div>
          {result.errors.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="num">Zeile</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="num">{e.line}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
