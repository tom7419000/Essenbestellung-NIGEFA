'use client';

import { formatCurrency } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { OrderLine } from '@/lib/types';
import { Card } from '@/components/ui/card';

/** Eigene Bestellung als Read-only-Liste (ORDERING_CLOSED / ORDERED / DELIVERED). */
export function MyOrdersList({ orders }: { orders: OrderLine[] }) {
  const { t, locale } = useI18n();
  const total = orders.reduce((sum, line) => sum + line.priceAtOrder * line.quantity, 0);

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100">
        {t('today.myOrders.title')}
      </h3>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {t('today.myOrders.empty')}
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {orders.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    <span className="font-semibold tabular-nums">{line.quantity}×</span>{' '}
                    {line.menuItem.name}
                  </p>
                  {line.note ? (
                    <p className="text-xs italic text-gray-500 dark:text-gray-400">
                      „{line.note}“
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                  {formatCurrency(line.priceAtOrder * line.quantity, locale)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {t('today.order.total')}
            </span>
            <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatCurrency(total, locale)}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
