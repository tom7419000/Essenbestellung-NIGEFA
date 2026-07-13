'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTheme } from 'next-themes';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorToMessage } from '@/lib/errors';
import { splitFieldErrors } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { urlBase64ToUint8Array } from '@/lib/push';
import type { Locale, User, VapidKeyResponse } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import { BellIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

export default function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('settings.title')}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('settings.subtitle')}</p>
      </div>
      <ProfileSection />
      <AppearanceSection />
      <NotificationSection />
      <WebPushSection />
      <PasswordSection />
    </div>
  );
}

function ProfileSection() {
  const { t } = useI18n();
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<User>('/users/me', { firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: (updated) => {
      updateUser(updated);
      setFieldErrors({});
      setGeneralErrors([]);
      toast.success(t('settings.profile.saved'));
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const { fieldErrors: fe, general } = splitFieldErrors(error.messages, [
          'firstName',
          'lastName',
        ]);
        setFieldErrors(fe);
        setGeneralErrors(general);
      } else {
        toast.error(errorToMessage(error, t));
      }
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Card>
      <CardHeader title={t('settings.profile.title')} description={user?.email} />
      <CardBody className="pt-0">
        <FormErrors errors={generalErrors} />
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('auth.firstName')}
              value={firstName}
              required
              onChange={(e) => setFirstName(e.target.value)}
              error={fieldErrors.firstName}
            />
            <Input
              label={t('auth.lastName')}
              value={lastName}
              required
              onChange={(e) => setLastName(e.target.value)}
              error={fieldErrors.lastName}
            />
          </div>
          <Button type="submit" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function AppearanceSection() {
  const { t, locale, setLocale } = useI18n();
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const changeLocale = (next: Locale) => {
    setLocale(next);
    if (user) {
      api
        .patch<User>('/users/me', { locale: next })
        .then(updateUser)
        .catch(() => {
          // Sprache bleibt lokal umgestellt, Sync beim nächsten Speichern.
        });
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('settings.appearance.title')}
        description={t('settings.appearance.description')}
      />
      <CardBody className="grid gap-4 pt-0 sm:grid-cols-2">
        <Select
          label={t('settings.appearance.language')}
          value={locale}
          onChange={(e) => changeLocale(e.target.value as Locale)}
        >
          <option value="de">{t('language.de')}</option>
          <option value="en">{t('language.en')}</option>
        </Select>
        <Select
          label={t('settings.appearance.theme')}
          value={mounted ? (theme ?? 'system') : 'system'}
          onChange={(e) => setTheme(e.target.value)}
          disabled={!mounted}
        >
          <option value="system">{t('theme.system')}</option>
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
        </Select>
      </CardBody>
    </Card>
  );
}

function NotificationSection() {
  const { t } = useI18n();
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (patch: { emailNotifications?: boolean; pushNotifications?: boolean }) =>
      api.patch<User>('/users/me', patch),
    onSuccess: (updated) => updateUser(updated),
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  if (!user) return null;

  return (
    <Card>
      <CardHeader
        title={t('settings.notifications.title')}
        description={t('settings.notifications.description')}
      />
      <CardBody className="space-y-3 pt-0">
        <Switch
          checked={user.emailNotifications}
          disabled={mutation.isPending}
          onChange={(checked) => mutation.mutate({ emailNotifications: checked })}
          label={t('settings.notifications.email')}
          description={t('settings.notifications.emailHint')}
        />
        <Switch
          checked={user.pushNotifications}
          disabled={mutation.isPending}
          onChange={(checked) => mutation.mutate({ pushNotifications: checked })}
          label={t('settings.notifications.push')}
          description={t('settings.notifications.pushHint')}
        />
      </CardBody>
    </Card>
  );
}

/**
 * Web-Push gemäß doc 05: Block nur anzeigen, wenn der Browser PushManager
 * unterstützt UND der Server einen VAPID-Key liefert.
 */
function WebPushSection() {
  const { t } = useI18n();
  const toast = useToast();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
  }, []);

  const vapidQuery = useQuery({
    queryKey: ['push', 'vapid'],
    queryFn: () => api.get<VapidKeyResponse>('/push/vapid-public-key'),
    enabled: supported,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration().then((registration) => {
      registration?.pushManager.getSubscription().then((subscription) => {
        setSubscribed(Boolean(subscription));
      });
    });
  }, [supported]);

  const key = vapidQuery.data?.key ?? null;
  if (!supported || !key) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error(t('settings.push.permissionDenied'));
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
      });
      const json = subscription.toJSON();
      await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
      toast.success(t('settings.push.enabled'));
    } catch (error) {
      toast.error(errorToMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.delete('/push/subscribe', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      toast.success(t('settings.push.disabled'));
    } catch (error) {
      toast.error(errorToMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('settings.push.title')}
        description={t('settings.push.description')}
      />
      <CardBody className="pt-0">
        {subscribed ? (
          <Button variant="secondary" onClick={() => void disable()} loading={busy}>
            <BellIcon className="h-4 w-4" />
            {t('settings.push.disableButton')}
          </Button>
        ) : (
          <Button onClick={() => void enable()} loading={busy}>
            <BellIcon className="h-4 w-4" />
            {t('settings.push.enableButton')}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function PasswordSection() {
  const { t } = useI18n();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => api.patch('/users/me/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      setGeneralErrors([]);
      toast.success(t('settings.password.saved'));
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const { fieldErrors: fe, general } = splitFieldErrors(error.messages, [
          'currentPassword',
          'newPassword',
        ]);
        setFieldErrors(fe);
        setGeneralErrors(general);
      } else {
        toast.error(errorToMessage(error, t));
      }
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralErrors([]);
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: t('settings.password.mismatch') });
      return;
    }
    mutation.mutate();
  };

  return (
    <Card>
      <CardHeader
        title={t('settings.password.title')}
        description={t('settings.password.description')}
      />
      <CardBody className="pt-0">
        <FormErrors errors={generalErrors} />
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input
            label={t('settings.password.current')}
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={fieldErrors.currentPassword}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('settings.password.new')}
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={fieldErrors.newPassword}
              hint={t('auth.passwordPolicy')}
            />
            <Input
              label={t('settings.password.confirm')}
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={fieldErrors.confirmPassword}
            />
          </div>
          <Button type="submit" loading={mutation.isPending}>
            {t('settings.password.saveButton')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
