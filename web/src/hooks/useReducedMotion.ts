import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query and re-renders when it changes.
 * @param query e.g. "(prefers-reduced-motion: reduce)"
 * @returns whether the query currently matches (false where matchMedia is unavailable)
 */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/**
 * True when the user asked the OS for reduced motion. Every continuous or cursor-driven
 * effect checks this and renders its static version instead.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** True on devices with a fine pointer that can hover (mouse/trackpad). Cursor-only effects require it. */
export function useFinePointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}
