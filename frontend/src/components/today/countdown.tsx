'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ClockIcon } from '@/components/icons';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Countdown bis zur Frist: tickt sekündlich (hh:mm:ss),
 * pulsiert amber < 10 min, rot < 1 min, ruft onExpire beim Erreichen von 0 auf.
 */
export function Countdown({
  deadline,
  label,
  onExpire,
  className,
}: {
  deadline: string;
  label: string;
  onExpire?: () => void;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const target = new Date(deadline).getTime();

  useEffect(() => {
    expiredRef.current = false;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  const remaining = Math.max(0, target - now);
  const isExpired = remaining <= 0;

  useEffect(() => {
    if (isExpired && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [isExpired, onExpire]);

  const totalSeconds = Math.floor(remaining / 1000);
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const time = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

  const urgency = remaining < 60_000 ? 'red' : remaining < 600_000 ? 'amber' : 'normal';

  return (
    <div
      role="timer"
      aria-label={`${label} ${time}`}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
        urgency === 'normal' &&
          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        urgency === 'amber' &&
          'animate-pulse bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
        urgency === 'red' && 'animate-pulse bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
        className,
      )}
    >
      <ClockIcon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      <span className="font-mono text-base font-semibold tabular-nums">{time}</span>
    </div>
  );
}
