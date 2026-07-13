import { mergeOrderItems } from './order-items.util';

describe('mergeOrderItems — Zusammenfassen doppelter Bestellpositionen', () => {
  it('lässt eindeutige Positionen unverändert', () => {
    const items = mergeOrderItems([
      { menuItemId: 'a', quantity: 1, note: 'ohne Zwiebeln' },
      { menuItemId: 'b', quantity: 2 },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ menuItemId: 'a', quantity: 1, note: 'ohne Zwiebeln' });
  });

  it('addiert Mengen gleicher Gerichte', () => {
    const items = mergeOrderItems([
      { menuItemId: 'a', quantity: 1 },
      { menuItemId: 'a', quantity: 2 },
    ]);
    expect(items).toEqual([{ menuItemId: 'a', quantity: 3 }]);
  });

  it('deckelt die Menge bei 20', () => {
    const items = mergeOrderItems([
      { menuItemId: 'a', quantity: 15 },
      { menuItemId: 'a', quantity: 15 },
    ]);
    expect(items[0].quantity).toBe(20);
  });

  it('die zuletzt angegebene Bemerkung gewinnt', () => {
    const items = mergeOrderItems([
      { menuItemId: 'a', quantity: 1, note: 'alt' },
      { menuItemId: 'a', quantity: 1, note: 'neu' },
    ]);
    expect(items[0].note).toBe('neu');
  });

  it('leere Eingabe bleibt leer (Bestellung stornieren)', () => {
    expect(mergeOrderItems([])).toEqual([]);
  });
});
