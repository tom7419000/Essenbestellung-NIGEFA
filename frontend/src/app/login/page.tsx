'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthPage, FormErrors } from '@/components/auth-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { splitFieldErrors } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();

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
      await login(email.trim(), password);
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.statusCode === 401) {
          setGeneralErrors([t('auth.invalidCredentials')]);
        } else {
          const { fieldErrors: fe, general } = splitFieldErrors(error.messages, [
            'email',
            'password',
          ]);
          setFieldErrors(fe);
          setGeneralErrors(general);
        }
      } else {
        setGeneralErrors([t('errors.network')]);
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthPage title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <FormErrors errors={generalErrors} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          {t('auth.loginButton')}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('auth.noAccount')}{' '}
        <Link
          href="/register"
          className="font-medium text-emerald-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400"
        >
          {t('auth.toRegister')}
        </Link>
      </p>
    </AuthPage>
  );
}
