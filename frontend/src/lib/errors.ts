import { ApiError } from './api';
import type { TFunction } from './i18n';

/** Menschlich lesbare Fehlermeldung für Toasts/Formulare. */
export function errorToMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    const text = error.messages.filter(Boolean).join(' · ');
    if (text) return text;
    return t('errors.generic');
  }
  return t('errors.network');
}
