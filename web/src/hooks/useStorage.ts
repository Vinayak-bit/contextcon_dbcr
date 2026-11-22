import { useCallback, useEffect, useRef, useState } from 'react';

/** State persisted to localStorage. Every access is guarded: storage may be unavailable. */
export function useLocalStorage<T>(key: string | null, initial: T): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const read = (): T => {
    if (!key) return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  };
  const [value, setValue] = useState<T>(read);
  const keyRef = useRef(key);
  useEffect(() => { if (keyRef.current !== key) { keyRef.current = key; setValue(read()); } }); // re-read when key changes
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      if (key) { try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  }, [key]);
  const clear = useCallback(() => { if (key) { try { window.localStorage.removeItem(key); } catch { /* ignore */ } } }, [key]);
  return [value, set, clear];
}

/** Calls `fn` immediately and then every `ms` while `active`; stops on unmount. */
export function usePolling(fn: () => void | Promise<void>, ms: number, active: boolean) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try { await saved.current(); } finally { if (!stopped) timer = setTimeout(tick, ms); }
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [ms, active]);
}
