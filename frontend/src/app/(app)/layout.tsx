'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AppShell } from '@/components/layout/app-shell';
import { PageSpinner } from '@/components/ui/spinner';

/** AuthGuard: ohne gültige Anmeldung → /login. */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' || !user) {
    return <PageSpinner label={t('common.loading')} />;
  }

  return <AppShell>{children}</AppShell>;
}
