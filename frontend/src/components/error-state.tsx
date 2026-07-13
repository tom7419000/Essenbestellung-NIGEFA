'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon, RefreshIcon } from '@/components/icons';
import { ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Fehlerzustand für fehlgeschlagene Queries mit Wiederholen-Button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const detail =
    error instanceof ApiError ? error.messages.join(' · ') : t('errors.network');
  return (
    <EmptyState
      icon={<AlertTriangleIcon className="h-7 w-7" />}
      title={t('errors.loadFailed')}
      description={detail}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            <RefreshIcon className="h-4 w-4" />
            {t('common.retry')}
          </Button>
        ) : undefined
      }
    />
  );
}
