'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from '@/components/icons';
import { useI18n } from '@/lib/i18n';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  show: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Mobil unten (über der Bottom-Nav), Desktop oben rechts */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 bottom-20 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-96"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3 shadow-lg dark:bg-gray-900',
              toast.type === 'success' && 'border-emerald-300 dark:border-emerald-800',
              toast.type === 'error' && 'border-red-300 dark:border-red-800',
              toast.type === 'info' && 'border-gray-200 dark:border-gray-700',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                toast.type === 'success' &&
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
                toast.type === 'error' &&
                  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
                toast.type === 'info' &&
                  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
              )}
            >
              {toast.type === 'success' ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : toast.type === 'error' ? (
                <AlertTriangleIcon className="h-3.5 w-3.5" />
              ) : (
                <InfoIcon className="h-3.5 w-3.5" />
              )}
            </span>
            <p className="flex-1 break-words text-sm text-gray-800 dark:text-gray-200">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={t('common.close')}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:text-gray-200"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
