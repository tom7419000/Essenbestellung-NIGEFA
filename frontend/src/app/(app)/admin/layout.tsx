'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const adminNav = [
  { href: '/admin', labelKey: 'admin.nav.dashboard', exact: true },
  { href: '/admin/users', labelKey: 'admin.nav.users' },
  { href: '/admin/restaurants', labelKey: 'admin.nav.restaurants' },
  { href: '/admin/day-plans', labelKey: 'admin.nav.dayPlans' },
  { href: '/admin/weekly-template', labelKey: 'admin.nav.weeklyTemplate' },
  { href: '/admin/settings', labelKey: 'admin.nav.settings' },
  { href: '/admin/audit', labelKey: 'admin.nav.audit' },
];

/** Admin-Guard (nur Rolle ADMIN) + Unternavigation (Desktop: Sekundärnav, mobil: scrollbare Tab-Leiste). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && user && user.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [status, user, router]);

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('admin.title')}</h1>
        <nav
          aria-label={t('admin.navLabel')}
          className="-mx-3 mt-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-max gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {adminNav.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                    active
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
      {children}
    </div>
  );
}
