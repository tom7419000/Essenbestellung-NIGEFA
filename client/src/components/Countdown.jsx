import { useEffect, useRef, useState } from 'react';

// Zeigt die Restzeit bis zu einer Deadline an. serverNow gleicht die
// Client-Uhr mit der Server-Uhr ab; onExpire feuert einmal pro Deadline.
export default function Countdown({ deadline, serverNow, onExpire }) {
  const offsetRef = useRef(0);
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    offsetRef.current = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
  }, [serverNow]);

  useEffect(() => {
    firedRef.current = false;
    const tick = () => {
      const ms = new Date(deadline).getTime() - (Date.now() + offsetRef.current);
      setRemaining(ms);
      if (ms <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (remaining == null) return null;
  if (remaining <= 0) return <span className="countdown expired">abgelaufen</span>;

  const total = Math.floor(remaining / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} h`
      : `${m}:${String(s).padStart(2, '0')} min`;

  return <span className={`countdown${remaining < 5 * 60_000 ? ' urgent' : ''}`}>{text}</span>;
}
