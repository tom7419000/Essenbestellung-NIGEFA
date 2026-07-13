'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { AppNotification, NotificationList } from '@/lib/types';
import {
  BellIcon,
  CartIcon,
  CheckIcon,
  ClockIcon,
  PackageIcon,
  TrophyIcon,
  VoteIcon,
  XIcon,
} from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonCards } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 20;

function typeIcon(type: string) {
  const upper = type.toUpperCase();
  if (upper.includes('WINNER') || upper.includes('TIE')) return TrophyIcon;
  if (upper.includes('DELIVER')) return PackageIcon;
  if (upper.includes('CANCEL')) return XIcon;
  if (upper.includes('REMIND')) return ClockIcon;
  if (upper.includes('VOT') || upper.includes('RUNOFF')) return VoteIcon;
  if (upper.includes('ORDER')) return CartIcon;
  return BellIcon;
}

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['notifications', 'list', page],
    queryFn: () => api.get<NotificationList>(`/notifications?page=${page}&limit=${PAGE_SIZE}`),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      invalidate();
      toast.success(t('notifications.allRead'));
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  const onItemClick = (notification: AppNotification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.dayPlanId) router.push('/');
  };

  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('notifications.title')}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {unreadCount > 0
              ? t('notifications.unreadCount', { count: unreadCount })
              : t('notifications.noUnread')}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => readAll.mutate()}
          loading={readAll.isPending}
          disabled={unreadCount === 0}
        >
          <CheckIcon className="h-4 w-4" />
          {t('notifications.markAllRead')}
        </Button>
      </div>

      {query.isPending ? (
        <SkeletonCards count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={<BellIcon className="h-7 w-7" />}
          title={t('notifications.empty.title')}
          description={t('notifications.empty.description')}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {query.data.items.map((notification) => {
              const Icon = typeIcon(notification.type);
              const unread = !notification.readAt;
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(notification)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                      unread
                        ? 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60'
                        : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/60',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        unread
                          ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            unread
                              ? 'font-semibold text-gray-900 dark:text-gray-100'
                              : 'font-medium text-gray-700 dark:text-gray-300',
                          )}
                        >
                          {notification.title}
                        </span>
                        <time
                          dateTime={notification.createdAt}
                          className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                        >
                          {relativeTime(notification.createdAt, locale)}
                        </time>
                      </span>
                      <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">
                        {notification.message}
                      </span>
                    </span>
                    {unread ? (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-400"
                        aria-label={t('notifications.unreadMarker')}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
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
