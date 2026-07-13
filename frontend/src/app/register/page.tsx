'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthPage, FormErrors } from '@/components/auth-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoIcon } from '@/components/icons';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { splitFieldErrors } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function RegisterPage() {
  const { t, locale } = useI18n();
  const { register } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralErrors([]);
    setSubmitting(true);
    try {
      await register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        locale,
      });
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiError) {
        const { fieldErrors: fe, general } = splitFieldErrors(error.messages, [
          'email',
          'password',
          'firstName',
          'lastName',
        ]);
        setFieldErrors(fe);
        setGeneralErrors(general);
      } else {
        setGeneralErrors([t('errors.network')]);
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthPage title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('auth.firstUserAdminHint')}</span>
      </div>
      <FormErrors errors={generalErrors} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('auth.firstName')}
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={fieldErrors.firstName}
          />
          <Input
            label={t('auth.lastName')}
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={fieldErrors.lastName}
          />
        </div>
        <Input
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          placeholder="max@nigefa.de"
        />
        <Input
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={t('auth.passwordPolicy')}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          {t('auth.registerButton')}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('auth.haveAccount')}{' '}
        <Link
          href="/login"
          className="font-medium text-emerald-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400"
        >
          {t('auth.toLogin')}
        </Link>
      </p>
    </AuthPage>
  );
}
