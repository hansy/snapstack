import { useCallback, useEffect, useRef } from "react";

type IdleTimeoutOptions = {
  enabled: boolean;
  timeoutMs: number;
  warningMs?: number;
  onTimeout: () => void;
  onWarning?: () => void;
  onResume?: () => void;
  onActivity?: () => void;
  pollIntervalMs?: number;
  subscribe?: (markActivity: () => void) => () => void;
};

const DEFAULT_ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "focus",
  "visibilitychange",
] as const;

export const useIdleTimeout = ({
  enabled,
  timeoutMs,
  warningMs,
  onTimeout,
  onWarning,
  onResume,
  onActivity,
  pollIntervalMs = 30_000,
  subscribe,
}: IdleTimeoutOptions) => {
  const lastActivityAtRef = useRef<number>(Date.now());
  const onTimeoutRef = useRef(onTimeout);
  const onWarningRef = useRef(onWarning);
  const onResumeRef = useRef(onResume);
  const onActivityRef = useRef(onActivity);
  const warningShownRef = useRef(false);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    onWarningRef.current = onWarning;
  }, [onWarning]);

  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  const markActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    if (warningShownRef.current) {
      warningShownRef.current = false;
      onResumeRef.current?.();
    }
    onActivityRef.current?.();
  }, []);

  const getRemainingMs = useCallback(
    () => Math.max(0, timeoutMs - (Date.now() - lastActivityAtRef.current)),
    [timeoutMs]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled) return;
    let didTimeout = false;
    warningShownRef.current = false;

    const handleActivity = (event?: Event) => {
      if (didTimeout) return;
      if (
        event?.type === "visibilitychange" &&
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      markActivity();
    };

    markActivity();
    DEFAULT_ACTIVITY_EVENTS.forEach((eventName) => {
      const target =
        eventName === "visibilitychange" && typeof document !== "undefined"
          ? document
          : window;
      target.addEventListener(eventName, handleActivity, { passive: true });
    });

    const unsubscribe = subscribe?.(markActivity);

    const checkIdle = () => {
      if (didTimeout) return;
      const elapsed = Date.now() - lastActivityAtRef.current;
      if (
        warningMs &&
        !warningShownRef.current &&
        elapsed >= Math.max(0, timeoutMs - warningMs)
      ) {
        warningShownRef.current = true;
        onWarningRef.current?.();
      }
      if (elapsed < timeoutMs) return;
      didTimeout = true;
      onTimeoutRef.current();
    };

    const interval = window.setInterval(checkIdle, pollIntervalMs);

    return () => {
      didTimeout = true;
      window.clearInterval(interval);
      DEFAULT_ACTIVITY_EVENTS.forEach((eventName) => {
        const target =
          eventName === "visibilitychange" && typeof document !== "undefined"
            ? document
            : window;
        target.removeEventListener(eventName, handleActivity);
      });
      unsubscribe?.();
    };
  }, [enabled, markActivity, pollIntervalMs, subscribe, timeoutMs, warningMs]);

  return { markActivity, getRemainingMs };
};
