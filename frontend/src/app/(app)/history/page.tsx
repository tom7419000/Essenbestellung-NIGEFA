'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDateLong } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { OrderHistoryEntry, Paginated } from '@/lib/types';
import { HistoryIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonCards } from '@/components/ui/skeleton';

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['orders', 'my', page],
    queryFn: () =>
      api.get<Paginated<OrderHistoryEntry>>(`/orders/my?page=${page}&limit=${PAGE_SIZE}`),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('history.title')}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('history.subtitle')}</p>
      </div>

      {query.isPending ? (
        <SkeletonCards count={4} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="h-7 w-7" />}
          title={t('history.empty.title')}
          description={t('history.empty.description')}
        />
      ) : (
        <>
          <ul className="space-y-4">
            {query.data.items.map((entry) => (
              <li key={entry.dayPlanId}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatDateLong(entry.date, locale)}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {entry.restaurantName}
                      </p>
                    </div>
                    <StatusBadge status={entry.dayStatus} />
                  </div>
                  <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                    {entry.lines.map((line, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200">
                            <span className="font-semibold tabular-nums">{line.quantity}×</span>{' '}
                            {line.name}
                          </p>
                          {line.note ? (
                            <p className="text-xs italic text-gray-500 dark:text-gray-400">
                              „{line.note}“
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-gray-700 dark:text-gray-300">
                          {formatCurrency(line.priceAtOrder * line.quantity, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-800">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      {t('today.order.total')}
                    </span>
                    <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {formatCurrency(entry.total, locale)}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            total={query.data.total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
