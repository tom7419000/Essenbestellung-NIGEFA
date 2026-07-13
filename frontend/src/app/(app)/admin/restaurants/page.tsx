'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRestaurants } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { ChevronRightIcon, PlusIcon, UtensilsIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { RestaurantFormDialog } from '@/components/admin/restaurant-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCards } from '@/components/ui/skeleton';

export default function AdminRestaurantsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useRestaurants(true);
  const [createOpen, setCreateOpen] = useState(false);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['restaurants'] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {t('admin.restaurants.title')}
        </h2>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon className="h-4 w-4" />
          {t('admin.restaurants.createButton')}
        </Button>
      </div>

      {query.isPending ? (
        <SkeletonCards count={4} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<UtensilsIcon className="h-7 w-7" />}
          title={t('admin.restaurants.empty')}
          description={t('admin.restaurants.emptyHint')}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              {t('admin.restaurants.createButton')}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {query.data.map((restaurant) => (
            <li key={restaurant.id}>
              <Link
                href={`/admin/restaurants/${restaurant.id}`}
                className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <Card className="flex h-full items-start justify-between gap-3 p-4 transition-shadow hover:shadow-md">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                      {restaurant.name}
                      {!restaurant.isActive ? (
                        <Badge color="red">{t('common.inactive')}</Badge>
                      ) : null}
                    </p>
                    {restaurant.cuisine ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {restaurant.cuisine}
                      </p>
                    ) : null}
                    {restaurant.description ? (
                      <p className="mt-1.5 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                        {restaurant.description}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-gray-400" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {createOpen ? (
        <RestaurantFormDialog
          restaurant={null}
          onClose={() => setCreateOpen(false)}
          onSaved={invalidate}
        />
      ) : null}
    </div>
  );
}
