'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { AuditLog, Paginated } from '@/lib/types';
import { ListIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

const PAGE_SIZE = 20;

export default function AdminAuditPage() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['audit', page],
    queryFn: () => api.get<Paginated<AuditLog>>(`/audit-logs?page=${page}&limit=${PAGE_SIZE}`),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {t('admin.audit.title')}
        </h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {t('admin.audit.subtitle')}
        </p>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<ListIcon className="h-7 w-7" />} title={t('admin.audit.empty')} />
      ) : (
        <>
          <Table>
            <THead>
              <Tr>
                <Th>{t('admin.audit.time')}</Th>
                <Th>{t('admin.audit.actor')}</Th>
                <Th>{t('admin.audit.action')}</Th>
                <Th>{t('admin.audit.entity')}</Th>
                <Th>{t('admin.audit.details')}</Th>
              </Tr>
            </THead>
            <TBody>
              {query.data.items.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="whitespace-nowrap">
                    {formatDateTime(entry.createdAt, locale)}
                  </Td>
                  <Td>
                    {entry.actor ? (
                      `${entry.actor.firstName} ${entry.actor.lastName}`
                    ) : (
                      <span className="italic text-gray-500 dark:text-gray-400">
                        {t('admin.audit.system')}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                      {entry.action}
                    </code>
                  </Td>
                  <Td>{entry.entityType}</Td>
                  <Td>
                    {entry.details && Object.keys(entry.details).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer select-none text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                          {t('admin.audit.showDetails')}
                        </summary>
                        <pre className="mt-2 max-h-64 max-w-md overflow-auto rounded-lg bg-gray-100 p-2.5 text-xs leading-relaxed dark:bg-gray-800">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={page}
            total={query.data.total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
