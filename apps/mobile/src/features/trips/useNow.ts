import { useEffect, useState } from 'react';
import { useScreenFocused } from '../../hooks/useFocusAwarePolling';

/** The current time, refreshed every `intervalMs` while the screen is on
 *  show — so countdowns and "departure passed" move on their own. */
export function useNow(intervalMs = 30_000): Date {
  const focused = useScreenFocused();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!focused) return undefined;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [focused, intervalMs]);

  return now;
}
