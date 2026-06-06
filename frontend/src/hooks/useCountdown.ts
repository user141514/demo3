import { useState, useEffect, useRef, useCallback } from "react";

export function useCountdown(totalSeconds: number, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const onExpireRef = useRef(onExpire);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const start = useCallback((seconds?: number) => {
    if (seconds !== undefined) setRemaining(seconds);
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => setIsRunning(false), []);
  const reset = useCallback((seconds?: number) => {
    setIsRunning(false);
    setRemaining(seconds ?? totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onExpireRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return { remaining, isRunning, minutes, seconds, start, pause, reset };
}
