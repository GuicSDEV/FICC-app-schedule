import { useEffect, useState } from "react";

/** The current time, refreshed every `interval` ms (slot "now" markers, countdowns). */
export function useNow(interval = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}
