export interface OrderItemInput {
  menuItemId: string;
  quantity: number;
  note?: string;
}

/**
 * Fasst doppelte Positionen (gleiches Gericht) zusammen: Mengen werden addiert
 * (Obergrenze 20), die zuletzt angegebene Bemerkung gewinnt. Pure Funktion.
 */
export function mergeOrderItems(items: OrderItemInput[]): OrderItemInput[] {
  const merged = new Map<string, OrderItemInput>();
  for (const item of items) {
    const existing = merged.get(item.menuItemId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + item.quantity, 20);
      if (item.note !== undefined) existing.note = item.note;
    } else {
      merged.set(item.menuItemId, { ...item });
    }
  }
  return [...merged.values()];
}
