'use client';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Locale, User } from '@/lib/types';
import { cn } from '@/lib/cn';

/**
 * DE/EN-Umschalter. Wechselt sofort die UI-Sprache und synchronisiert
 * die Profilsprache per PATCH /users/me, wenn angemeldet.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const { user, updateUser } = useAuth();

  const switchTo = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    if (user) {
      api
        .patch<User>('/users/me', { locale: next })
        .then(updateUser)
        .catch(() => {
          // Profil-Sync fehlgeschlagen — UI-Sprache bleibt lokal umgestellt.
        });
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-gray-200 p-0.5 dark:border-gray-700',
        className,
      )}
      role="group"
      aria-label={t('language.switchLabel')}
    >
      {(['de', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          aria-pressed={locale === code}
          aria-label={t(`language.${code}`)}
          className={cn(
            'h-9 min-w-11 rounded-md px-2 text-sm font-medium uppercase transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
            locale === code
              ? 'bg-emerald-600 text-white dark:bg-emerald-500'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
