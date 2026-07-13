'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';
import { useI18n } from '@/lib/i18n';

const ORDER = ['system', 'light', 'dark'] as const;

/** Kompakter Umschalter für den Header: rotiert System → Hell → Dunkel. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className="inline-block h-11 w-11" aria-hidden="true" />;
  }

  const current = (ORDER as readonly string[]).includes(theme ?? '')
    ? (theme as (typeof ORDER)[number])
    : 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={t('theme.toggleLabel', {
        current: t(`theme.${current}`),
        next: t(`theme.${next}`),
      })}
      title={t(`theme.${current}`)}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      {current === 'light' ? (
        <SunIcon className="h-5 w-5" />
      ) : current === 'dark' ? (
        <MoonIcon className="h-5 w-5" />
      ) : (
        <MonitorIcon className="h-5 w-5" />
      )}
    </button>
  );
}
