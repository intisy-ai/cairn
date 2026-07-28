export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  wrapped.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}
