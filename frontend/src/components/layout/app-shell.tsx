'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import {
  BellIcon,
  ClipboardIcon,
  CogIcon,
  HistoryIcon,
  HomeIcon,
  ShieldIcon,
  UtensilsIcon,
} from '@/components/icons';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';
import { LanguageSwitcher } from './language-switcher';
import { UserMenu } from './user-menu';

interface NavItem {
  href: string;
  labelKey: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  exact?: boolean;
}

const mainNav: NavItem[] = [
  { href: '/', labelKey: 'nav.today', icon: HomeIcon, exact: true },
  { href: '/history', labelKey: 'nav.history', icon: HistoryIcon },
  { href: '/notifications', labelKey: 'nav.notifications', icon: BellIcon },
  { href: '/settings', labelKey: 'nav.settings', icon: CogIcon },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact || item.href === '/') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500">
        <UtensilsIcon width={18} height={18} />
      </span>
      <span className="text-sm font-bold leading-tight text-gray-900 dark:text-gray-100">
        NIGEFA
        <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
          Essensbestellung
        </span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const isAdmin = user?.role === 'ADMIN';

  const organizerItem: NavItem = { href: '/organizer', labelKey: 'nav.organizer', icon: ClipboardIcon };
  const adminItem: NavItem = { href: '/admin', labelKey: 'nav.admin', icon: ShieldIcon };

  const bottomNav: NavItem[] = [
    mainNav[0],
    mainNav[1],
    organizerItem,
    ...(isAdmin ? [adminItem] : []),
    mainNav[3],
  ];

  const renderSidebarLink = (item: NavItem) => {
    const active = isActive(pathname, item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
          active
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {t(item.labelKey)}
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      {/* Desktop-Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex">
        <div className="flex h-14 items-center border-b border-gray-200 px-3 dark:border-gray-800">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={t('nav.mainNav')}>
          {mainNav.map(renderSidebarLink)}
          <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('nav.managementSection')}
          </p>
          {renderSidebarLink(organizerItem)}
          {isAdmin ? renderSidebarLink(adminItem) : null}
        </nav>
      </aside>

      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 lg:pl-60">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell />
            <ThemeToggle />
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Inhalt */}
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-5xl px-3 pb-24 pt-5 sm:px-6 lg:pb-10">
          {children}
        </div>
      </main>

      {/* Mobile Bottom-Navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-800 dark:bg-gray-900 lg:hidden"
        aria-label={t('nav.mainNav')}
      >
        <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${bottomNav.length}, 1fr)` }}>
          {bottomNav.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500',
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-gray-500 dark:text-gray-400',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
