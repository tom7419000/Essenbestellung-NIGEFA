'use client';

import { Button } from './button';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { useI18n } from '@/lib/i18n';

export function Pagination({
  page,
  total,
  limit,
  onPageChange,
}: {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav
      className="flex items-center justify-between gap-3 pt-2"
      aria-label={t('common.pagination')}
    >
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {t('common.previous')}
      </Button>
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {t('common.pageOf', { page, pages })}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
      >
        {t('common.next')}
        <ChevronRightIcon className="h-4 w-4" />
      </Button>
    </nav>
  );
}
