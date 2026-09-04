import { useEffect, useRef, useState } from 'react';

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Holds a screen wake lock while `active`. The lock is dropped by the browser
 * whenever the page is hidden, so it has to be re-requested on every return to
 * the foreground — without that, the phone sleeps mid-demo.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !wakeLockSupported) return;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinelRef.current || document.visibilityState !== 'visible') return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setHeld(true);
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
            setHeld(false);
          }
        });
      } catch {
        setHeld(false);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setHeld(false);
      if (sentinel) void sentinel.release().catch(() => {});
    };
  }, [active]);

  return { supported: wakeLockSupported, held };
}
