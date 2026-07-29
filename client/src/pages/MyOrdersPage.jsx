import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ItemLabel from '../components/ItemLabel.jsx';
import { fmtDateShort, fmtPrice, statusLabel } from '../format.js';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/my/orders')
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!orders) return <div className="page-loading">Lädt …</div>;

  return (
    <div className="stack">
      <div className="card">
        <h1>Meine Bestellungen</h1>
        {orders.length === 0 ? (
          <p className="muted">Du hast bisher nichts bestellt.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Restaurant</th>
                  <th>Gericht</th>
                  <th>Bemerkung</th>
                  <th className="num">Preis</th>
                  <th>Status</th>
                  <th>Bezahlt</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{fmtDateShort(o.date)}</td>
                    <td>{o.restaurantName || '–'}</td>
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
                    <td className="muted">{o.note || '–'}</td>
                    <td className="num">{fmtPrice(o.totalCents)}</td>
                    <td>
                      <span className={`badge order-${o.status}`}>{statusLabel(o.status)}</span>
                    </td>
                    <td>
                      {o.status !== 'storniert' &&
                        (o.paid ? (
                          <span className="badge badge-ok">bezahlt</span>
                        ) : (
                          <span className="badge badge-off">offen</span>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
