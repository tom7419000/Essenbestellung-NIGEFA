'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { WeeklyTemplate, WeeklyTemplatePayload } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import { TrashIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import {
  DayPlanFormFields,
  type DayPlanFormValue,
} from '@/components/admin/day-plan-form-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkeletonCards } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

/** Reihenfolge Mo…So (weekday 0 = Sonntag). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const EMPTY_TEMPLATE = (weekday: number): WeeklyTemplate => ({
  weekday,
  isActive: false,
  restaurants: [],
  organizer: null,
  voteDeadlineTime: null,
  orderDeadlineTime: null,
  tieBreakStrategy: null,
});

export default function AdminWeeklyTemplatePage() {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ['weekly-templates'],
    queryFn: () => api.get<WeeklyTemplate[]>('/weekly-templates'),
  });

  if (query.isPending) return <SkeletonCards count={4} />;
  if (query.error)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const byWeekday = new Map(query.data.map((template) => [template.weekday, template]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {t('admin.template.title')}
        </h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {t('admin.template.subtitle')}
        </p>
      </div>
      {WEEKDAY_ORDER.map((weekday) => (
        <WeekdayCard
          key={weekday}
          weekday={weekday}
          template={byWeekday.get(weekday) ?? EMPTY_TEMPLATE(weekday)}
        />
      ))}
    </div>
  );
}

function templateToForm(template: WeeklyTemplate): DayPlanFormValue {
  return {
    restaurantIds: template.restaurants.map((r) => r.id),
    organizerId: template.organizer?.id ?? '',
    voteDeadlineTime: template.voteDeadlineTime ?? '',
    orderDeadlineTime: template.orderDeadlineTime ?? '',
    tieBreakStrategy: template.tieBreakStrategy ?? '',
  };
}

function WeekdayCard({ weekday, template }: { weekday: number; template: WeeklyTemplate }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [isActive, setIsActive] = useState(template.isActive);
  const [form, setForm] = useState<DayPlanFormValue>(() => templateToForm(template));
  const [expanded, setExpanded] = useState(template.isActive);
  const [confirmClear, setConfirmClear] = useState(false);
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['weekly-templates'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: WeeklyTemplatePayload = {
        isActive,
        restaurantIds: form.restaurantIds,
        organizerId: form.organizerId || null,
        ...(form.voteDeadlineTime ? { voteDeadlineTime: form.voteDeadlineTime } : {}),
        ...(form.orderDeadlineTime ? { orderDeadlineTime: form.orderDeadlineTime } : {}),
        tieBreakStrategy: form.tieBreakStrategy || null,
      };
      return api.put<WeeklyTemplate>(`/weekly-templates/${weekday}`, payload);
    },
    onSuccess: () => {
      setGeneralErrors([]);
      toast.success(t('admin.template.saved', { day: t(`weekday.${weekday}`) }));
      invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError) setGeneralErrors(error.messages);
      else toast.error(errorToMessage(error, t));
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.delete(`/weekly-templates/${weekday}`),
    onSuccess: () => {
      setConfirmClear(false);
      setIsActive(false);
      setForm(templateToForm(EMPTY_TEMPLATE(weekday)));
      toast.success(t('admin.template.cleared', { day: t(`weekday.${weekday}`) }));
      invalidate();
    },
    onError: (error) => {
      setConfirmClear(false);
      toast.error(errorToMessage(error, t));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setGeneralErrors([]);
    if (isActive && form.restaurantIds.length === 0) {
      setGeneralErrors([t('admin.dayPlans.needRestaurants')]);
      return;
    }
    saveMutation.mutate();
  };

  const summary =
    template.restaurants.length > 0
      ? template.restaurants.map((r) => r.name).join(', ')
      : t('admin.template.emptyDay');

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t(`weekday.${weekday}`)}
            {template.isActive ? (
              <Badge color="emerald">{t('common.active')}</Badge>
            ) : (
              <Badge color="gray">{t('common.inactive')}</Badge>
            )}
          </span>
        }
        description={summary}
        action={
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? t('common.collapse') : t('common.edit')}
          </Button>
        }
      />
      {expanded ? (
        <CardBody className="border-t border-gray-100 dark:border-gray-800">
          <FormErrors errors={generalErrors} />
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Switch
              checked={isActive}
              onChange={setIsActive}
              label={t('admin.template.isActive')}
              description={t('admin.template.isActiveHint')}
            />
            <DayPlanFormFields
              idPrefix={`template-${weekday}`}
              value={form}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmClear(true)}
                disabled={saveMutation.isPending}
              >
                <TrashIcon className="h-4 w-4" />
                {t('admin.template.clearButton')}
              </Button>
              <Button type="submit" loading={saveMutation.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </CardBody>
      ) : null}
      <ConfirmDialog
        open={confirmClear}
        title={t('admin.template.clearTitle', { day: t(`weekday.${weekday}`) })}
        message={t('admin.template.clearMessage')}
        confirmLabel={t('admin.template.clearButton')}
        destructive
        loading={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
        onCancel={() => setConfirmClear(false)}
      />
    </Card>
  );
}
