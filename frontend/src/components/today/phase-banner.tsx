import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BannerTone = 'gray' | 'blue' | 'violet' | 'amber' | 'emerald' | 'sky' | 'green' | 'red';

const tones: Record<BannerTone, string> = {
  gray: 'border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200',
  blue: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200',
  violet:
    'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-200',
  amber:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  emerald:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
  sky: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200',
  green:
    'border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/60 dark:text-green-200',
  red: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200',
};

/** Farbiges Hinweisbanner für die Tagesphasen (Status stets mit Text + Icon, nicht nur Farbe). */
export function PhaseBanner({
  tone,
  icon,
  title,
  children,
  action,
  className,
}: {
  tone: BannerTone;
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('rounded-xl border px-4 py-3.5', tones[tone], className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            {children ? <div className="mt-0.5 text-sm opacity-90">{children}</div> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
