'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiDownload, ApiError, downloadBlob } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { formatCurrency, formatDateLong, formatTime, toDateInputValue } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { DayPlanDetail, DayPlanLite, Summary } from '@/lib/types';
import {
  CalendarIcon,
  CheckIcon,
  ClipboardIcon,
  DownloadIcon,
  PackageIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SkeletonCards } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

export default function OrganizerPage() {
  const { t } = useI18n();
  const [date, setDate] = useState(() => toDateInputValue(new Date()));

  // Deep-Link ?date=YYYY-MM-DD (ohne useSearchParams: window.location direkt lesen).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('date');
    if (fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl)) setDate(fromUrl);
  }, []);

  const plansQuery = useQuery({
    queryKey: ['day-plans', 'range', date, date],
    queryFn: () => api.get<DayPlanLite[]>(`/day-plans?from=${date}&to=${date}`),
  });

  const planId = plansQuery.data?.[0]?.id;

  const detailQuery = useQuery({
    queryKey: ['day-plans', planId],
    queryFn: () => api.get<DayPlanDetail>(`/day-plans/${planId}`),
    enabled: Boolean(planId),
  });

  const summaryQuery = useQuery({
    queryKey: ['day-plans', planId, 'summary'],
    queryFn: () => api.get<Summary>(`/day-plans/${planId}/summary`),
    enabled: Boolean(planId),
    retry: false,
  });

  const forbidden =
    summaryQuery.error instanceof ApiError && summaryQuery.error.statusCode === 403;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('organizer.title')}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t('organizer.subtitle')}
          </p>
        </div>
        <Input
          type="date"
          label={t('organizer.dateLabel')}
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="w-full sm:w-56"
        />
      </div>

      {plansQuery.isPending ? (
        <SkeletonCards count={2} />
      ) : plansQuery.error ? (
        <ErrorState error={plansQuery.error} onRetry={() => void plansQuery.refetch()} />
      ) : !planId ? (
        <EmptyState
          icon={<CalendarIcon className="h-7 w-7" />}
          title={t('organizer.noPlan.title')}
          description={t('organizer.noPlan.description')}
        />
      ) : forbidden ? (
        <EmptyState
          icon={<ShieldIcon className="h-7 w-7" />}
          title={t('organizer.forbidden.title')}
          description={t('organizer.forbidden.description')}
        />
      ) : detailQuery.isPending || summaryQuery.isPending ? (
        <SkeletonCards count={3} />
      ) : detailQuery.error ? (
        <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
      ) : summaryQuery.error ? (
        <ErrorState error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
      ) : detailQuery.data && summaryQuery.data ? (
        // key erzwingt Remount bei Datumswechsel (setzt lokalen Notiz-State zurück)
        <OrganizerContent key={detailQuery.data.id} plan={detailQuery.data} summary={summaryQuery.data} />
      ) : null}
    </div>
  );
}

function OrganizerContent({ plan, summary }: { plan: DayPlanDetail; summary: Summary }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState(plan.organizerNote ?? '');
  const [view, setView] = useState<'byMenuItem' | 'byUser'>('byMenuItem');
  const [downloading, setDownloading] = useState<'pdf' | 'xlsx' | null>(null);

  const statusMutation = useMutation({
    mutationFn: (status: 'ORDERED' | 'DELIVERED') =>
      api.patch<DayPlanDetail>(`/day-plans/${plan.id}/order-status`, {
        status,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (_, status) => {
      toast.success(
        status === 'ORDERED' ? t('organizer.actions.markedOrdered') : t('organizer.actions.markedDelivered'),
      );
      void queryClient.invalidateQueries({ queryKey: ['day-plans'] });
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  const exportFile = async (format: 'pdf' | 'xlsx') => {
    setDownloading(format);
    try {
      const { blob, filename } = await apiDownload(`/day-plans/${plan.id}/export?format=${format}`);
      downloadBlob(blob, filename ?? `essensbestellung-${plan.date}.${format}`);
    } catch (error) {
      toast.error(errorToMessage(error, t));
    } finally {
      setDownloading(null);
    }
  };

  const winnerName = summary.dayPlan.winnerRestaurant?.name ?? plan.winnerRestaurant?.name ?? '—';

  return (
    <div className="space-y-5">
      {/* Kopf: Plan-Infos + Export */}
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {formatDateLong(plan.date, locale)}
              <StatusBadge status={plan.status} />
            </span>
          }
          description={
            plan.orderDeadline
              ? `${winnerName} · ${t('organizer.orderDeadline')}: ${formatTime(plan.orderDeadline, locale)}`
              : winnerName
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void exportFile('pdf')}
                loading={downloading === 'pdf'}
              >
                <DownloadIcon className="h-4 w-4" />
                {t('organizer.exportPdf')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void exportFile('xlsx')}
                loading={downloading === 'xlsx'}
              >
                <DownloadIcon className="h-4 w-4" />
                {t('organizer.exportExcel')}
              </Button>
            </div>
          }
        />
        <CardBody className="grid grid-cols-2 gap-3 pt-0 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950/50">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              <UsersIcon className="h-3.5 w-3.5" />
              {t('organizer.participants')}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {summary.participantCount}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950/50">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              <ClipboardIcon className="h-3.5 w-3.5" />
              {t('organizer.itemsTotal')}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {summary.byMenuItem.reduce((sum, item) => sum + item.totalQuantity, 0)}
            </p>
          </div>
          <div className="col-span-2 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/40 sm:col-span-1">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {t('organizer.grandTotal')}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(summary.grandTotal, locale)}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Status-Workflow */}
      <Card>
        <CardHeader
          title={t('organizer.actions.title')}
          description={t('organizer.actions.description')}
        />
        <CardBody className="space-y-4 pt-0">
          <Textarea
            label={t('organizer.actions.noteLabel')}
            placeholder={t('organizer.actions.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => statusMutation.mutate('ORDERED')}
              loading={statusMutation.isPending && statusMutation.variables === 'ORDERED'}
              disabled={statusMutation.isPending || plan.status === 'ORDERED' || plan.status === 'DELIVERED'}
            >
              <CheckIcon className="h-4 w-4" />
              {t('organizer.actions.markOrdered')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => statusMutation.mutate('DELIVERED')}
              loading={statusMutation.isPending && statusMutation.variables === 'DELIVERED'}
              disabled={statusMutation.isPending || plan.status === 'DELIVERED'}
            >
              <PackageIcon className="h-4 w-4" />
              {t('organizer.actions.markDelivered')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Zusammenfassung */}
      <div className="space-y-4">
        <Tabs
          tabs={[
            { id: 'byMenuItem', label: t('organizer.byMenuItem') },
            { id: 'byUser', label: t('organizer.byUser') },
          ]}
          active={view}
          onChange={(id) => setView(id as 'byMenuItem' | 'byUser')}
        />
        {view === 'byMenuItem' ? (
          summary.byMenuItem.length === 0 ? (
            <EmptyState title={t('organizer.noOrders')} />
          ) : (
            <ul className="space-y-3">
              {summary.byMenuItem.map((item) => (
                <li key={item.menuItemId}>
                  <Card className="p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                          {item.totalQuantity}×
                        </span>{' '}
                        {item.name}
                      </p>
                      <p className="shrink-0 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                        {formatCurrency(item.price, locale)} / {t('organizer.perItem')}
                      </p>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {item.orders.map((order, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-400">
                          <span className="tabular-nums">{order.quantity}×</span>{' '}
                          {order.user.firstName} {order.user.lastName}
                          {order.note ? (
                            <span className="italic text-amber-700 dark:text-amber-400">
                              {' '}
                              — „{order.note}“
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </li>
              ))}
            </ul>
          )
        ) : summary.byUser.length === 0 ? (
          <EmptyState title={t('organizer.noOrders')} />
        ) : (
          <ul className="space-y-3">
            {summary.byUser.map((entry) => (
              <li key={entry.user.id}>
                <Card className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {entry.user.firstName} {entry.user.lastName}
                    </p>
                    <p className="shrink-0 font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {formatCurrency(entry.userTotal, locale)}
                    </p>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {entry.lines.map((line, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-3 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <span>
                          <span className="tabular-nums">{line.quantity}×</span> {line.name}
                          {line.note ? (
                            <span className="italic text-amber-700 dark:text-amber-400">
                              {' '}
                              — „{line.note}“
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatCurrency(line.lineTotal, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
