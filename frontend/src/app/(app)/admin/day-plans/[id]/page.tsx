'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { formatDateLong, formatDateTime, toTimeInputValue } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { DayPlanDetail, UpdateDayPlanPayload, VoteRecord } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import { ChevronLeftIcon, ClipboardIcon, TrophyIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import {
  DayPlanFormFields,
  type DayPlanFormValue,
} from '@/components/admin/day-plan-form-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCards } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

type PlanActionType =
  | 'open-voting'
  | 'close-voting'
  | 'close-ordering'
  | 'reopen-ordering'
  | 'cancel'
  | 'delete'
  | 'decide-winner';

interface PlanAction {
  type: PlanActionType;
  restaurantId?: string;
  restaurantName?: string;
}

/** Editierbar nur vor ORDERING_CLOSED (siehe API-Spezifikation PATCH /day-plans/:id). */
const EDITABLE_STATUSES = [
  'SCHEDULED',
  'VOTING_OPEN',
  'RUNOFF_VOTING',
  'TIE_ADMIN_DECISION',
  'ORDERING_OPEN',
];

export default function AdminDayPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [confirmAction, setConfirmAction] = useState<PlanAction | null>(null);

  const planQuery = useQuery({
    queryKey: ['day-plans', planId],
    queryFn: () => api.get<DayPlanDetail>(`/day-plans/${planId}`),
    enabled: Boolean(planId),
  });

  const votesQuery = useQuery({
    queryKey: ['day-plans', planId, 'votes'],
    queryFn: () => api.get<VoteRecord[]>(`/day-plans/${planId}/votes`),
    enabled: Boolean(planId),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['day-plans'] });

  const actionMutation = useMutation({
    mutationFn: (action: PlanAction) => {
      switch (action.type) {
        case 'open-voting':
          return api.post(`/day-plans/${planId}/open-voting`);
        case 'close-voting':
          return api.post(`/day-plans/${planId}/close-voting`);
        case 'close-ordering':
          return api.post(`/day-plans/${planId}/close-ordering`);
        case 'reopen-ordering':
          return api.post(`/day-plans/${planId}/reopen-ordering`);
        case 'cancel':
          return api.post(`/day-plans/${planId}/cancel`);
        case 'decide-winner':
          return api.post(`/day-plans/${planId}/decide-winner`, {
            restaurantId: action.restaurantId,
          });
        case 'delete':
          return api.delete(`/day-plans/${planId}`);
      }
    },
    onSuccess: (_, action) => {
      setConfirmAction(null);
      toast.success(t(`admin.dayPlans.actions.${action.type}.done`));
      invalidate();
      if (action.type === 'delete') router.replace('/admin/day-plans');
    },
    onError: (error) => {
      setConfirmAction(null);
      toast.error(errorToMessage(error, t));
    },
  });

  if (planQuery.isPending) return <SkeletonCards count={3} />;
  if (planQuery.error)
    return <ErrorState error={planQuery.error} onRetry={() => void planQuery.refetch()} />;

  const plan = planQuery.data;
  const status = plan.status;

  const availableActions: PlanAction[] = [];
  if (status === 'SCHEDULED') availableActions.push({ type: 'open-voting' });
  if (status === 'VOTING_OPEN' || status === 'RUNOFF_VOTING')
    availableActions.push({ type: 'close-voting' });
  if (status === 'ORDERING_OPEN') availableActions.push({ type: 'close-ordering' });
  if (status === 'ORDERING_CLOSED') availableActions.push({ type: 'reopen-ordering' });
  if (status !== 'CANCELLED' && status !== 'DELIVERED')
    availableActions.push({ type: 'cancel' });
  if (status === 'SCHEDULED' || status === 'CANCELLED')
    availableActions.push({ type: 'delete' });

  const canDecideWinner = status === 'TIE_ADMIN_DECISION' || status === 'ORDERING_OPEN';

  return (
    <div className="space-y-4">
      <Link
        href="/admin/day-plans"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {t('admin.dayPlans.backToList')}
      </Link>

      {/* Kopf */}
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {formatDateLong(plan.date, locale)}
              <StatusBadge status={status} />
            </span>
          }
          description={
            plan.organizer
              ? `${t('admin.dayPlans.organizer')}: ${plan.organizer.firstName} ${plan.organizer.lastName}`
              : t('admin.dayPlans.noOrganizer')
          }
          action={
            <Link href={`/organizer?date=${plan.date}`}>
              <Button variant="secondary" size="sm">
                <ClipboardIcon className="h-4 w-4" />
                {t('admin.dayPlans.toSummary')}
              </Button>
            </Link>
          }
        />
        <CardBody className="grid gap-3 pt-0 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('admin.dayPlans.voteDeadline')}
            </p>
            <p className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
              {plan.voteDeadline ? formatDateTime(plan.voteDeadline, locale) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('admin.dayPlans.orderDeadline')}
            </p>
            <p className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
              {plan.orderDeadline ? formatDateTime(plan.orderDeadline, locale) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('admin.dayPlans.runoffDeadline')}
            </p>
            <p className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
              {plan.runoffDeadline ? formatDateTime(plan.runoffDeadline, locale) : '—'}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Aktionen */}
      {availableActions.length > 0 ? (
        <Card>
          <CardHeader
            title={t('admin.dayPlans.actionsTitle')}
            description={t('admin.dayPlans.actionsHint')}
          />
          <CardBody className="flex flex-wrap gap-2 pt-0">
            {availableActions.map((action) => (
              <Button
                key={action.type}
                variant={
                  action.type === 'cancel' || action.type === 'delete' ? 'danger' : 'secondary'
                }
                onClick={() => setConfirmAction(action)}
              >
                {t(`admin.dayPlans.actions.${action.type}.button`)}
              </Button>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {/* Optionen mit Stimmen */}
      <Card>
        <CardHeader
          title={t('admin.dayPlans.optionsTitle')}
          description={t('today.vote.totalVotes', { count: plan.totalVotes })}
        />
        <CardBody className="space-y-2 pt-0">
          {plan.options.map((option) => {
            const isWinner = plan.winnerRestaurant?.id === option.restaurantId;
            return (
              <div
                key={option.restaurantId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-800"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {option.name}
                  </span>
                  {isWinner ? (
                    <Badge color="emerald">
                      <TrophyIcon className="h-3 w-3" />
                      {t('admin.dayPlans.winner')}
                    </Badge>
                  ) : null}
                  {option.isRunoffCandidate ? (
                    <Badge color="violet">{t('admin.dayPlans.runoffCandidate')}</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                    {t('today.vote.voteCount', { count: option.voteCount })}
                  </span>
                  {canDecideWinner && !isWinner ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setConfirmAction({
                          type: 'decide-winner',
                          restaurantId: option.restaurantId,
                          restaurantName: option.name,
                        })
                      }
                    >
                      <TrophyIcon className="h-4 w-4" />
                      {t('today.tie.decideButton')}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {/* Bearbeiten */}
      <EditPlanCard plan={plan} onSaved={invalidate} />

      {/* Einzelstimmen */}
      <Card>
        <CardHeader title={t('admin.dayPlans.votesTitle')} />
        <CardBody className="pt-0">
          {votesQuery.isPending ? (
            <SkeletonCards count={1} />
          ) : votesQuery.error ? (
            <ErrorState error={votesQuery.error} onRetry={() => void votesQuery.refetch()} />
          ) : votesQuery.data.length === 0 ? (
            <EmptyState title={t('admin.dayPlans.noVotes')} />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('admin.users.name')}</Th>
                  <Th>{t('admin.dayPlans.votedFor')}</Th>
                  <Th>{t('admin.dayPlans.round')}</Th>
                  <Th>{t('admin.dayPlans.votedAt')}</Th>
                </Tr>
              </THead>
              <TBody>
                {votesQuery.data.map((vote, i) => (
                  <Tr key={i}>
                    <Td className="font-medium text-gray-900 dark:text-gray-100">
                      {vote.user.firstName} {vote.user.lastName}
                    </Td>
                    <Td>{vote.restaurant.name}</Td>
                    <Td>
                      {vote.isRunoffVote ? (
                        <Badge color="violet">{t('admin.dayPlans.runoffRound')}</Badge>
                      ) : (
                        <Badge color="blue">{t('admin.dayPlans.mainRound')}</Badge>
                      )}
                    </Td>
                    <Td>{formatDateTime(vote.createdAt, locale)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction ? t(`admin.dayPlans.actions.${confirmAction.type}.title`) : ''}
        message={
          confirmAction
            ? t(`admin.dayPlans.actions.${confirmAction.type}.message`, {
                name: confirmAction.restaurantName ?? '',
              })
            : ''
        }
        confirmLabel={
          confirmAction ? t(`admin.dayPlans.actions.${confirmAction.type}.button`) : undefined
        }
        destructive={confirmAction?.type === 'cancel' || confirmAction?.type === 'delete'}
        loading={actionMutation.isPending}
        onConfirm={() => confirmAction && actionMutation.mutate(confirmAction)}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function planToForm(plan: DayPlanDetail): DayPlanFormValue {
  return {
    restaurantIds: plan.options.map((o) => o.restaurantId),
    organizerId: plan.organizer?.id ?? '',
    voteDeadlineTime: toTimeInputValue(plan.voteDeadline),
    orderDeadlineTime: toTimeInputValue(plan.orderDeadline),
    tieBreakStrategy: plan.tieBreakStrategy ?? '',
  };
}

function EditPlanCard({ plan, onSaved }: { plan: DayPlanDetail; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const editable = EDITABLE_STATUSES.includes(plan.status);

  const [form, setForm] = useState<DayPlanFormValue>(() => planToForm(plan));
  const [seededPlanId, setSeededPlanId] = useState(plan.id);
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  // Formular neu befüllen, wenn ein anderer Plan geladen wird (Render-Zeit-Anpassung).
  if (seededPlanId !== plan.id) {
    setSeededPlanId(plan.id);
    setForm(planToForm(plan));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload: UpdateDayPlanPayload = {
        restaurantIds: form.restaurantIds,
        organizerId: form.organizerId || null,
        ...(form.voteDeadlineTime ? { voteDeadlineTime: form.voteDeadlineTime } : {}),
        ...(form.orderDeadlineTime ? { orderDeadlineTime: form.orderDeadlineTime } : {}),
        ...(form.tieBreakStrategy ? { tieBreakStrategy: form.tieBreakStrategy } : {}),
      };
      return api.patch<DayPlanDetail>(`/day-plans/${plan.id}`, payload);
    },
    onSuccess: () => {
      toast.success(t('admin.dayPlans.updated'));
      setGeneralErrors([]);
      onSaved();
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
      <CardHeader
        title={t('admin.dayPlans.editTitle')}
        description={editable ? undefined : t('admin.dayPlans.notEditable')}
      />
      <CardBody className="pt-0">
        <FormErrors errors={generalErrors} />
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DayPlanFormFields
            idPrefix="edit-plan"
            value={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            disabled={!editable}
          />
          <Button type="submit" loading={mutation.isPending} disabled={!editable}>
            {t('common.save')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
