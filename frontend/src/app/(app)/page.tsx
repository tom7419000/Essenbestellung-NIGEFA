'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorToMessage } from '@/lib/errors';
import { formatDateLong, formatTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { DayPlanDetail } from '@/lib/types';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CartIcon,
  CheckIcon,
  InfoIcon,
  PackageIcon,
  TrophyIcon,
  VoteIcon,
  XIcon,
} from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCards } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Countdown } from '@/components/today/countdown';
import { MyOrdersList } from '@/components/today/my-orders-list';
import { OrderPanel } from '@/components/today/order-panel';
import { PhaseBanner } from '@/components/today/phase-banner';
import { VotePanel } from '@/components/today/vote-panel';

export default function TodayPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const query = useQuery({
    queryKey: ['day-plans', 'today'],
    queryFn: () => api.get<DayPlanDetail>('/day-plans/today'),
    refetchInterval: 15_000,
    retry: false,
  });

  const refetchToday = () => {
    void queryClient.invalidateQueries({ queryKey: ['day-plans', 'today'] });
  };

  const decideWinner = useMutation({
    mutationFn: (restaurantId: string) =>
      api.post(`/day-plans/${query.data?.id}/decide-winner`, { restaurantId }),
    onSuccess: () => {
      toast.success(t('today.tie.decided'));
      refetchToday();
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  const plan = query.data;
  const notFound = query.error instanceof ApiError && query.error.statusCode === 404;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('today.title')}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {formatDateLong(plan?.date ?? new Date().toISOString(), locale)}
          </p>
        </div>
        {plan ? <StatusBadge status={plan.status} /> : null}
      </div>

      {query.isPending ? (
        <SkeletonCards count={3} />
      ) : notFound ? (
        <EmptyState
          icon={<CalendarIcon className="h-7 w-7" />}
          title={t('today.noPlan.title')}
          description={t('today.noPlan.description')}
          action={
            isAdmin ? (
              <Link href="/admin/day-plans">
                <Button>{t('today.noPlan.createButton')}</Button>
              </Link>
            ) : undefined
          }
        />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : plan ? (
        <TodayContent
          plan={plan}
          isAdmin={isAdmin}
          onDeadlineReached={refetchToday}
          onDecideWinner={(restaurantId) => decideWinner.mutate(restaurantId)}
          decidePending={decideWinner.isPending}
        />
      ) : null}
    </div>
  );
}

function TodayContent({
  plan,
  isAdmin,
  onDeadlineReached,
  onDecideWinner,
  decidePending,
}: {
  plan: DayPlanDetail;
  isAdmin: boolean;
  onDeadlineReached: () => void;
  onDecideWinner: (restaurantId: string) => void;
  decidePending: boolean;
}) {
  const { t, locale } = useI18n();

  const optionsPreview = (
    <div className="grid gap-3 sm:grid-cols-2">
      {plan.options.map((option) => (
        <Card key={option.restaurantId} className="p-4">
          <p className="font-semibold text-gray-900 dark:text-gray-100">{option.name}</p>
          {option.cuisine ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{option.cuisine}</p>
          ) : null}
          {option.description ? (
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{option.description}</p>
          ) : null}
        </Card>
      ))}
    </div>
  );

  switch (plan.status) {
    case 'SCHEDULED':
      return (
        <div className="space-y-4">
          <PhaseBanner
            tone="gray"
            icon={<InfoIcon className="h-5 w-5" />}
            title={t('today.scheduled.title')}
          >
            {plan.voteDeadline
              ? t('today.scheduled.hint', { time: formatTime(plan.voteDeadline, locale) })
              : null}
          </PhaseBanner>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('today.scheduled.optionsTitle')}
          </h2>
          {optionsPreview}
        </div>
      );

    case 'VOTING_OPEN':
      return <VotePanel plan={plan} onDeadlineReached={onDeadlineReached} />;

    case 'RUNOFF_VOTING':
      return (
        <div className="space-y-4">
          <PhaseBanner
            tone="violet"
            icon={<VoteIcon className="h-5 w-5" />}
            title={t('today.runoff.banner')}
          >
            {t('today.runoff.hint')}
          </PhaseBanner>
          <VotePanel plan={plan} onDeadlineReached={onDeadlineReached} />
        </div>
      );

    case 'TIE_ADMIN_DECISION': {
      const runoffCandidates = plan.options.filter((o) => o.isRunoffCandidate);
      const maxVotes = Math.max(0, ...plan.options.map((o) => o.voteCount));
      const tiedOptions =
        runoffCandidates.length > 0
          ? runoffCandidates
          : plan.options.filter((o) => o.voteCount === maxVotes);
      return (
        <div className="space-y-4">
          <PhaseBanner
            tone="amber"
            icon={<AlertTriangleIcon className="h-5 w-5" />}
            title={t('today.tie.banner')}
          >
            {t('today.tie.hint')}
          </PhaseBanner>
          <div className="grid gap-3 sm:grid-cols-2">
            {tiedOptions.map((option) => (
              <Card key={option.restaurantId} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{option.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('today.vote.voteCount', { count: option.voteCount })}
                    </p>
                  </div>
                </div>
                {isAdmin ? (
                  <Button
                    className="mt-3 w-full"
                    onClick={() => onDecideWinner(option.restaurantId)}
                    loading={decidePending}
                  >
                    <TrophyIcon className="h-4 w-4" />
                    {t('today.tie.decideButton')}
                  </Button>
                ) : null}
              </Card>
            ))}
          </div>
        </div>
      );
    }

    case 'ORDERING_OPEN':
      return <OrderPanel plan={plan} onDeadlineReached={onDeadlineReached} />;

    case 'ORDERING_CLOSED':
      return (
        <div className="space-y-4">
          <PhaseBanner
            tone="amber"
            icon={<CartIcon className="h-5 w-5" />}
            title={t('today.closed.banner', { name: plan.winnerRestaurant?.name ?? '' })}
          >
            {t('today.closed.hint')}
            {plan.organizerNote ? <OrganizerNote note={plan.organizerNote} /> : null}
          </PhaseBanner>
          <MyOrdersList orders={plan.myOrders} />
        </div>
      );

    case 'ORDERED':
      return (
        <div className="space-y-4">
          <PhaseBanner
            tone="sky"
            icon={<CheckIcon className="h-5 w-5" />}
            title={t('today.ordered.banner', { name: plan.winnerRestaurant?.name ?? '' })}
          >
            {t('today.ordered.hint')}
            {plan.organizerNote ? <OrganizerNote note={plan.organizerNote} /> : null}
          </PhaseBanner>
          <MyOrdersList orders={plan.myOrders} />
        </div>
      );

    case 'DELIVERED':
      return (
        <div className="space-y-4">
          <PhaseBanner
            tone="green"
            icon={<PackageIcon className="h-5 w-5" />}
            title={t('today.delivered.banner')}
          >
            {t('today.delivered.hint')}
            {plan.organizerNote ? <OrganizerNote note={plan.organizerNote} /> : null}
          </PhaseBanner>
          <MyOrdersList orders={plan.myOrders} />
        </div>
      );

    case 'CANCELLED':
      return (
        <PhaseBanner
          tone="red"
          icon={<XIcon className="h-5 w-5" />}
          title={t('today.cancelled.banner')}
        >
          {t('today.cancelled.hint')}
        </PhaseBanner>
      );

    default:
      return (
        <div className="space-y-4">
          {plan.voteDeadline ? (
            <Countdown
              deadline={plan.voteDeadline}
              label={t('today.countdown.endsIn')}
              onExpire={onDeadlineReached}
            />
          ) : null}
          {optionsPreview}
        </div>
      );
  }
}

function OrganizerNote({ note }: { note: string }) {
  const { t } = useI18n();
  return (
    <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-sm font-medium dark:bg-gray-950/40">
      <span className="font-semibold">{t('today.organizerNote')}:</span> {note}
    </p>
  );
}
