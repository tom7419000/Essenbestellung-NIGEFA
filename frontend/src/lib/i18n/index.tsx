'use client';

// Leichtgewichtiger i18n-Provider ohne externe Abhängigkeit.
// Deutsch ist Standard; Wörterbücher: de.json / en.json (flache Punkt-Schlüssel).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import de from './de.json';
import en from './en.json';
import type { Locale } from '../types';

export const LOCALE_STORAGE_KEY = 'nigefa.locale';

const dictionaries: Record<Locale, Record<string, string>> = {
  de: de as Record<string, string>,
  en: en as Record<string, string>,
};

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  /** Wechselt nur die UI-Sprache (Persistenz in localStorage; PATCH /users/me machen Aufrufer). */
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('de');

  // Initial aus localStorage (nach Mount, um Hydration-Mismatch zu vermeiden).
  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'de' || stored === 'en') setLocaleState(stored);
  }, []);

  // <html lang> aktualisieren + persistieren.
  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback<TFunction>(
    (key, params) => {
      let text = dictionaries[locale][key] ?? dictionaries.de[key] ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
