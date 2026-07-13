'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { CogIcon, LogoutIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.userMenu')}
        className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white dark:bg-emerald-500">
          {initials}
        </span>
      </button>
      <div
        role="menu"
        className={cn(
          'absolute right-0 z-40 mt-2 w-64 origin-top-right rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-800 dark:bg-gray-900',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
        </div>
        <Link
          href="/settings"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="mt-1 flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <CogIcon className="h-4 w-4" />
          {t('nav.settings')}
        </Link>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            void logout();
          }}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-red-400 dark:hover:bg-red-950/50"
        >
          <LogoutIcon className="h-4 w-4" />
          {t('nav.logout')}
        </button>
      </div>
    </div>
  );
}
