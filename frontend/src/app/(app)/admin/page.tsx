'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Stats } from '@/lib/types';
import { ChartIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCards } from '@/components/ui/skeleton';

const DAYS = 30;

export default function AdminDashboardPage() {
  const { t, locale } = useI18n();

  const query = useQuery({
    queryKey: ['stats', 'dashboard', DAYS],
    queryFn: () => api.get<Stats>(`/stats/dashboard?days=${DAYS}`),
  });

  if (query.isPending) return <SkeletonCards count={4} />;
  if (query.error)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const stats = query.data;

  const statCards = [
    { label: t('admin.dashboard.totalUsers'), value: String(stats.totalUsers) },
    { label: t('admin.dashboard.activeUsers'), value: String(stats.activeUsers) },
    {
      label: t('admin.dashboard.participationRate'),
      value: `${Math.round(stats.participationRate * 100)} %`,
    },
    { label: t('admin.dashboard.votesToday'), value: String(stats.votesToday) },
    { label: t('admin.dashboard.ordersToday'), value: String(stats.ordersToday) },
    { label: t('admin.dashboard.totalSpend'), value: formatCurrency(stats.totalSpend, locale) },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('admin.dashboard.periodHint', { days: DAYS })}
      </p>

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => (
          <Card key={card.label} className="p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className="mt-1 truncate text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Beliebteste Restaurants */}
        <Card>
          <CardHeader title={t('admin.dashboard.topRestaurants')} />
          <CardBody className="pt-0">
            {stats.topRestaurants.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.noData')}</p>
            ) : (
              <BarList
                items={stats.topRestaurants.map((r) => ({
                  key: r.restaurantId,
                  label: r.name,
                  value: r.votes,
                  valueLabel: `${t('admin.dashboard.wins', { count: r.wins })} · ${t('admin.dashboard.votes', { count: r.votes })}`,
                }))}
              />
            )}
          </CardBody>
        </Card>

        {/* Meistbestellte Gerichte */}
        <Card>
          <CardHeader title={t('admin.dashboard.topMenuItems')} />
          <CardBody className="pt-0">
            {stats.topMenuItems.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.noData')}</p>
            ) : (
              <BarList
                items={stats.topMenuItems.map((item, i) => ({
                  key: `${item.name}-${i}`,
                  label: item.name,
                  sublabel: item.restaurantName,
                  value: item.totalQuantity,
                  valueLabel: `${item.totalQuantity}×`,
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Verlauf */}
      <Card>
        <CardHeader
          title={t('admin.dashboard.history')}
          description={t('admin.dashboard.historyHint')}
        />
        <CardBody className="pt-0">
          {stats.ordersPerDay.length === 0 ? (
            <EmptyState icon={<ChartIcon className="h-7 w-7" />} title={t('common.noData')} />
          ) : (
            <OrdersPerDayChart data={stats.ordersPerDay} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** Horizontale Balkenliste (reine Divs, kein Chart-Framework). */
function BarList({
  items,
}: {
  items: { key: string; label: string; sublabel?: string; value: number; valueLabel: string }[];
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-200">
              {item.label}
              {item.sublabel ? (
                <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
                  {item.sublabel}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {item.valueLabel}
            </span>
          </div>
          <div
            className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
            role="img"
            aria-label={`${item.label}: ${item.valueLabel}`}
          >
            <div
              className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Einfaches Säulendiagramm der Teilnehmer pro Tag (Divs mit ARIA-Labels). */
function OrdersPerDayChart({
  data,
}: {
  data: { date: string; participants: number; orders: number; total: number }[];
}) {
  const { t, locale } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.participants));
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label={t('admin.dashboard.historyHint')}>
        {data.map((day) => {
          const percent = (day.participants / max) * 100;
          const label = t('admin.dashboard.dayBarLabel', {
            date: formatDate(day.date, locale),
            participants: day.participants,
            orders: day.orders,
            total: formatCurrency(day.total, locale),
          });
          return (
            <div
              key={day.date}
              role="img"
              aria-label={label}
              title={label}
              className="flex h-full flex-1 items-end"
            >
              <div
                className={
                  day.participants > 0
                    ? 'w-full rounded-t bg-emerald-500 transition-colors hover:bg-emerald-600 dark:bg-emerald-400 dark:hover:bg-emerald-300'
                    : 'w-full rounded-t bg-gray-200 dark:bg-gray-800'
                }
                style={{ height: `${Math.max(2, percent)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{formatDate(data[0].date, locale)}</span>
        <span>{formatDate(data[data.length - 1].date, locale)}</span>
      </div>
    </div>
  );
}
