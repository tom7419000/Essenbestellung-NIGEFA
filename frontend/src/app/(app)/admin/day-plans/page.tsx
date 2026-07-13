'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { addDays, formatDate, toDateInputValue } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { CreateDayPlanPayload, DayPlanLite } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import { CalendarIcon, PlusIcon, TemplateIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import {
  DayPlanFormFields,
  type DayPlanFormValue,
} from '@/components/admin/day-plan-form-fields';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

export default function AdminDayPlansPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const from = toDateInputValue(addDays(new Date(), -14));
  const to = toDateInputValue(addDays(new Date(), 14));

  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['day-plans', 'range', from, to],
    queryFn: () => api.get<DayPlanLite[]>(`/day-plans?from=${from}&to=${to}`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['day-plans'] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {t('admin.dayPlans.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('admin.dayPlans.rangeHint', {
              from: formatDate(from, locale),
              to: formatDate(to, locale),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setGenerateOpen(true)}>
            <TemplateIcon className="h-4 w-4" />
            {t('admin.dayPlans.generateButton')}
          </Button>
          <Button onClick={() => setCreateOpen((v) => !v)}>
            <PlusIcon className="h-4 w-4" />
            {t('admin.dayPlans.createButton')}
          </Button>
        </div>
      </div>

      {createOpen ? (
        <CreatePlanCard
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            invalidate();
          }}
        />
      ) : null}

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-7 w-7" />}
          title={t('admin.dayPlans.empty')}
          description={t('admin.dayPlans.emptyHint')}
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t('admin.dayPlans.date')}</Th>
              <Th>{t('admin.dayPlans.status')}</Th>
              <Th>{t('admin.dayPlans.winner')}</Th>
              <Th>{t('admin.dayPlans.organizer')}</Th>
              <Th className="text-right">{t('admin.dayPlans.votes')}</Th>
              <Th className="text-right">{t('admin.dayPlans.orders')}</Th>
            </Tr>
          </THead>
          <TBody>
            {query.data.map((plan) => (
              <Tr
                key={plan.id}
                onClick={() => router.push(`/admin/day-plans/${plan.id}`)}
                className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
              >
                <Td>
                  <Link
                    href={`/admin/day-plans/${plan.id}`}
                    className="font-medium text-gray-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-100"
                  >
                    {formatDate(plan.date, locale)}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge status={plan.status} />
                </Td>
                <Td>{plan.winnerRestaurant?.name ?? '—'}</Td>
                <Td>
                  {plan.organizer
                    ? `${plan.organizer.firstName} ${plan.organizer.lastName}`
                    : '—'}
                </Td>
                <Td className="text-right tabular-nums">{plan.totalVotes}</Td>
                <Td className="text-right tabular-nums">{plan.totalOrders}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {generateOpen ? (
        <GenerateDialog
          onClose={() => setGenerateOpen(false)}
          onGenerated={() => {
            setGenerateOpen(false);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function CreatePlanCard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [form, setForm] = useState<DayPlanFormValue>({
    restaurantIds: [],
    organizerId: '',
    voteDeadlineTime: '',
    orderDeadlineTime: '',
    tieBreakStrategy: '',
  });
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateDayPlanPayload = {
        date,
        restaurantIds: form.restaurantIds,
        organizerId: form.organizerId || null,
        ...(form.voteDeadlineTime ? { voteDeadlineTime: form.voteDeadlineTime } : {}),
        ...(form.orderDeadlineTime ? { orderDeadlineTime: form.orderDeadlineTime } : {}),
        ...(form.tieBreakStrategy ? { tieBreakStrategy: form.tieBreakStrategy } : {}),
      };
      return api.post<DayPlanLite>('/day-plans', payload);
    },
    onSuccess: () => {
      toast.success(t('admin.dayPlans.created'));
      onCreated();
    },
    onError: (error) => {
      if (error instanceof ApiError) setGeneralErrors(error.messages);
      else toast.error(errorToMessage(error, t));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setGeneralErrors([]);
    if (form.restaurantIds.length === 0) {
      setGeneralErrors([t('admin.dayPlans.needRestaurants')]);
      return;
    }
    mutation.mutate();
  };

  return (
    <Card>
      <CardHeader title={t('admin.dayPlans.createTitle')} />
      <CardBody className="pt-0">
        <FormErrors errors={generalErrors} />
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label={t('admin.dayPlans.date')}
            type="date"
            required
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="sm:max-w-xs"
          />
          <DayPlanFormFields
            idPrefix="create-plan"
            value={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t('admin.dayPlans.createConfirm')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function GenerateDialog({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [error, setError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => api.post<DayPlanLite>('/day-plans/generate', { date }),
    onSuccess: () => {
      toast.success(t('admin.dayPlans.generated'));
      onGenerated();
    },
    onError: (err) => setError(errorToMessage(err, t)),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('admin.dayPlans.generateTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              setError(undefined);
              mutation.mutate();
            }}
            loading={mutation.isPending}
          >
            <TemplateIcon className="h-4 w-4" />
            {t('admin.dayPlans.generateConfirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('admin.dayPlans.generateHint')}
        </p>
        <Input
          label={t('admin.dayPlans.date')}
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          error={error}
        />
      </div>
    </Dialog>
  );
}
