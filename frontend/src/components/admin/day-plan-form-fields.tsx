'use client';

import { useAllUsers, useRestaurants } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { TieBreakStrategy } from '@/lib/types';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

export interface DayPlanFormValue {
  restaurantIds: string[];
  organizerId: string; // '' = kein Organisator
  voteDeadlineTime: string; // '' = globale Einstellung
  orderDeadlineTime: string; // '' = globale Einstellung
  tieBreakStrategy: TieBreakStrategy | ''; // '' = globale Einstellung
}

/** Gemeinsame Formularfelder für Tagesplan anlegen/bearbeiten und Wochenvorlage. */
export function DayPlanFormFields({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value: DayPlanFormValue;
  onChange: (patch: Partial<DayPlanFormValue>) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const { t } = useI18n();
  const restaurantsQuery = useRestaurants(false);
  const usersQuery = useAllUsers();

  const toggleRestaurant = (id: string) => {
    const set = new Set(value.restaurantIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ restaurantIds: Array.from(set) });
  };

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled}>
        <legend className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('admin.dayPlans.restaurants')}
        </legend>
        {restaurantsQuery.isPending ? (
          <Spinner className="h-5 w-5 text-gray-400" />
        ) : restaurantsQuery.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{t('errors.loadFailed')}</p>
        ) : restaurantsQuery.data.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('admin.dayPlans.noRestaurants')}
          </p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {restaurantsQuery.data.map((restaurant) => (
              <label
                key={restaurant.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 dark:border-gray-700 dark:hover:bg-gray-800 dark:has-[:checked]:border-emerald-600 dark:has-[:checked]:bg-emerald-950/40"
              >
                <input
                  type="checkbox"
                  checked={value.restaurantIds.includes(restaurant.id)}
                  onChange={() => toggleRestaurant(restaurant.id)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-800 dark:text-gray-200">
                    {restaurant.name}
                  </span>
                  {restaurant.cuisine ? (
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {restaurant.cuisine}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Select
        id={`${idPrefix}-organizer`}
        label={t('admin.dayPlans.organizer')}
        value={value.organizerId}
        disabled={disabled}
        onChange={(e) => onChange({ organizerId: e.target.value })}
      >
        <option value="">{t('admin.dayPlans.noOrganizer')}</option>
        {(usersQuery.data ?? []).map((user) => (
          <option key={user.id} value={user.id}>
            {user.firstName} {user.lastName}
          </option>
        ))}
      </Select>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id={`${idPrefix}-vote-time`}
          label={t('admin.dayPlans.voteDeadlineTime')}
          type="time"
          value={value.voteDeadlineTime}
          disabled={disabled}
          onChange={(e) => onChange({ voteDeadlineTime: e.target.value })}
          hint={t('admin.dayPlans.timeFallbackHint')}
        />
        <Input
          id={`${idPrefix}-order-time`}
          label={t('admin.dayPlans.orderDeadlineTime')}
          type="time"
          value={value.orderDeadlineTime}
          disabled={disabled}
          onChange={(e) => onChange({ orderDeadlineTime: e.target.value })}
          hint={t('admin.dayPlans.timeFallbackHint')}
        />
      </div>

      <Select
        id={`${idPrefix}-tiebreak`}
        label={t('admin.dayPlans.tieBreakStrategy')}
        value={value.tieBreakStrategy}
        disabled={disabled}
        onChange={(e) => onChange({ tieBreakStrategy: e.target.value as TieBreakStrategy | '' })}
      >
        <option value="">{t('tieBreak.GLOBAL')}</option>
        <option value="RUNOFF">{t('tieBreak.RUNOFF')}</option>
        <option value="ADMIN_DECISION">{t('tieBreak.ADMIN_DECISION')}</option>
      </Select>
    </div>
  );
}
