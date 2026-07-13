'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/spinner';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UtensilsIcon } from '@/components/icons';

/** Rahmen für Login/Registrierung: zentrierte Karte, Sprach- und Theme-Umschalter. */
export function AuthPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  // Bereits angemeldet → zur Heute-Seite.
  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  if (status === 'authenticated') return <PageSpinner label={t('common.loading')} />;

  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
      <div className="flex items-center justify-end gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg dark:bg-emerald-500">
              <UtensilsIcon width={26} height={26} />
            </span>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('app.name')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('app.tagline')}</p>
          </div>
          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
            ) : null}
            <div className="mt-5">{children}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Liste allgemeiner (nicht feldspezifischer) API-Fehlermeldungen. */
export function FormErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
    >
      <ul className={errors.length > 1 ? 'list-disc space-y-0.5 pl-4' : undefined}>
        {errors.map((message, i) => (
          <li key={i}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
