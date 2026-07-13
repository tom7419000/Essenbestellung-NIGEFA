'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { NotificationList } from '@/lib/types';
import { BellIcon } from '@/components/icons';

/** Glocke mit Ungelesen-Badge; pollt alle 30 s. */
export function NotificationBell() {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ['notifications', 'badge'],
    queryFn: () => api.get<NotificationList>('/notifications?page=1&limit=1'),
    refetchInterval: 30_000,
  });

  const unread = data?.unreadCount ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('nav.notifications')
      }
      className="relative flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      <BellIcon className="h-5 w-5" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
