export type TimeoutHandle = ReturnType<typeof setTimeout>;

export type TimeoutRef = { current: TimeoutHandle | null };

export const cancelDebouncedTimeout = (ref: TimeoutRef) => {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
};

export const scheduleDebouncedTimeout = (ref: TimeoutRef, delayMs: number, fn: () => void) => {
  cancelDebouncedTimeout(ref);
  ref.current = setTimeout(() => {
    ref.current = null;
    fn();
  }, delayMs);
};

