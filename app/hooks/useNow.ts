import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs`. Reading Date.now() during
 * render is impure; this keeps the value stable between ticks.
 */
const useNow = (intervalMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
};

export default useNow;
