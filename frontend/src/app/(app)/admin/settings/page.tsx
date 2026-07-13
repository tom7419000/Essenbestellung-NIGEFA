'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { Settings, TieBreakStrategy } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SkeletonCards } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

export default function AdminSettingsPage() {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/settings'),
  });

  if (query.isPending) return <SkeletonCards count={2} />;
  if (query.error)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {t('admin.settings.title')}
        </h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {t('admin.settings.subtitle')}
        </p>
      </div>
      <SettingsForm settings={query.data} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [voteDeadlineTime, setVoteDeadlineTime] = useState(settings.voteDeadlineTime);
  const [orderDeadlineTime, setOrderDeadlineTime] = useState(settings.orderDeadlineTime);
  const [tieBreakStrategy, setTieBreakStrategy] = useState<TieBreakStrategy>(
    settings.tieBreakStrategy,
  );
  const [runoffMinutes, setRunoffMinutes] = useState(String(settings.runoffMinutes));
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(
    String(settings.reminderLeadMinutes),
  );
  const [timezone, setTimezone] = useState(settings.timezone);
  const [autoGenerateFromTemplate, setAutoGenerateFromTemplate] = useState(
    settings.autoGenerateFromTemplate,
  );
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<Settings>('/settings', {
        voteDeadlineTime,
        orderDeadlineTime,
        tieBreakStrategy,
        runoffMinutes: Number(runoffMinutes),
        reminderLeadMinutes: Number(reminderLeadMinutes),
        timezone: timezone.trim(),
        autoGenerateFromTemplate,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      setGeneralErrors([]);
      toast.success(t('admin.settings.saved'));
    },
    onError: (error) => {
      if (error instanceof ApiError) setGeneralErrors(error.messages);
      else toast.error(errorToMessage(error, t));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setGeneralErrors([]);
    mutation.mutate();
  };

  return (
    <Card>
      <CardHeader
        title={t('admin.settings.formTitle')}
        description={t('admin.settings.formHint')}
      />
      <CardBody className="pt-0">
        <FormErrors errors={generalErrors} />
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('admin.dayPlans.voteDeadlineTime')}
              type="time"
              required
              value={voteDeadlineTime}
              onChange={(e) => setVoteDeadlineTime(e.target.value)}
            />
            <Input
              label={t('admin.dayPlans.orderDeadlineTime')}
              type="time"
              required
              value={orderDeadlineTime}
              onChange={(e) => setOrderDeadlineTime(e.target.value)}
            />
          </div>
          <Select
            label={t('admin.dayPlans.tieBreakStrategy')}
            value={tieBreakStrategy}
            onChange={(e) => setTieBreakStrategy(e.target.value as TieBreakStrategy)}
          >
            <option value="RUNOFF">{t('tieBreak.RUNOFF')}</option>
            <option value="ADMIN_DECISION">{t('tieBreak.ADMIN_DECISION')}</option>
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('admin.settings.runoffMinutes')}
              type="number"
              min={1}
              max={240}
              required
              value={runoffMinutes}
              onChange={(e) => setRunoffMinutes(e.target.value)}
              hint={t('admin.settings.runoffMinutesHint')}
            />
            <Input
              label={t('admin.settings.reminderLeadMinutes')}
              type="number"
              min={0}
              max={240}
              required
              value={reminderLeadMinutes}
              onChange={(e) => setReminderLeadMinutes(e.target.value)}
              hint={t('admin.settings.reminderLeadMinutesHint')}
            />
          </div>
          <Input
            label={t('admin.settings.timezone')}
            required
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Europe/Berlin"
          />
          <Switch
            checked={autoGenerateFromTemplate}
            onChange={setAutoGenerateFromTemplate}
            label={t('admin.settings.autoGenerate')}
            description={t('admin.settings.autoGenerateHint')}
          />
          <Button type="submit" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
