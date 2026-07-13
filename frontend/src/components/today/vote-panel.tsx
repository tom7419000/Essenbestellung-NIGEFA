'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { DayPlanDetail, DayPlanOption } from '@/lib/types';
import { cn } from '@/lib/cn';
import { CheckIcon } from '@/components/icons';
import { Countdown } from './countdown';
import { useToast } from '@/components/ui/toast';

/**
 * Abstimmungs-Panel für VOTING_OPEN und RUNOFF_VOTING.
 * Klick = Stimme abgeben/ändern; Klick auf die eigene Karte = Stimme zurückziehen.
 * Die API-Antwort ist das frische DayPlanDetail und wird direkt in den Cache geschrieben.
 */
export function VotePanel({
  plan,
  onDeadlineReached,
}: {
  plan: DayPlanDetail;
  onDeadlineReached: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isRunoff = plan.status === 'RUNOFF_VOTING';
  const options = isRunoff ? plan.options.filter((o) => o.isRunoffCandidate) : plan.options;
  const myVoteId = isRunoff ? plan.myRunoffVote?.restaurantId : plan.myVote?.restaurantId;
  const deadline = isRunoff ? plan.runoffDeadline : plan.voteDeadline;

  const applyResult = (data: DayPlanDetail) => {
    queryClient.setQueryData(['day-plans', 'today'], data);
  };

  const voteMutation = useMutation({
    mutationFn: (restaurantId: string) =>
      api.put<DayPlanDetail>(`/day-plans/${plan.id}/vote`, { restaurantId }),
    onSuccess: (data) => {
      applyResult(data);
      toast.success(t('today.vote.saved'));
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  const unvoteMutation = useMutation({
    mutationFn: () => api.delete<DayPlanDetail>(`/day-plans/${plan.id}/vote`),
    onSuccess: (data) => {
      applyResult(data);
      toast.success(t('today.vote.removed'));
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  const pending = voteMutation.isPending || unvoteMutation.isPending;

  const onOptionClick = (option: DayPlanOption) => {
    if (pending) return;
    if (option.restaurantId === myVoteId) {
      unvoteMutation.mutate();
    } else {
      voteMutation.mutate(option.restaurantId);
    }
  };

  return (
    <section aria-label={t('today.vote.title')} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {isRunoff ? t('today.vote.runoffTitle') : t('today.vote.title')}
        </h2>
        {deadline ? (
          <Countdown
            deadline={deadline}
            label={t('today.countdown.endsIn')}
            onExpire={onDeadlineReached}
          />
        ) : null}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('today.vote.hint')}{' '}
        {t('today.vote.totalVotes', { count: plan.totalVotes })}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const mine = option.restaurantId === myVoteId;
          const percent =
            plan.totalVotes > 0 ? Math.round((option.voteCount / plan.totalVotes) * 100) : 0;
          return (
            <li key={option.restaurantId}>
              <button
                type="button"
                onClick={() => onOptionClick(option)}
                disabled={pending}
                aria-pressed={mine}
                aria-label={
                  mine
                    ? t('today.vote.optionMineLabel', { name: option.name })
                    : t('today.vote.optionLabel', { name: option.name })
                }
                className={cn(
                  'block h-full w-full rounded-xl border bg-white p-4 text-left transition-shadow',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950',
                  'disabled:opacity-70 dark:bg-gray-900',
                  mine
                    ? 'border-emerald-600 ring-2 ring-emerald-600 dark:border-emerald-500 dark:ring-emerald-500'
                    : 'border-gray-200 hover:border-emerald-300 hover:shadow-md dark:border-gray-800 dark:hover:border-emerald-800',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{option.name}</p>
                    {option.cuisine ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{option.cuisine}</p>
                    ) : null}
                  </div>
                  {mine ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white dark:bg-emerald-500">
                      <CheckIcon className="h-3 w-3" />
                      {t('today.vote.yourVote')}
                    </span>
                  ) : null}
                </div>
                {option.description ? (
                  <p className="mt-1.5 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                    {option.description}
                  </p>
                ) : null}
                <div className="mt-3">
                  <div
                    className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                    role="img"
                    aria-label={t('today.vote.voteBarLabel', {
                      name: option.name,
                      count: option.voteCount,
                      total: plan.totalVotes,
                    })}
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500 dark:bg-emerald-400"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('today.vote.voteCount', { count: option.voteCount })}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
