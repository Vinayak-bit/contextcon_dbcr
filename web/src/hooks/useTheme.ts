import { useCallback, useEffect, useState } from 'react';

/** The user's theme choice. "system" follows the OS; the default is light regardless of OS. */
export type ThemeChoice = 'light' | 'system' | 'dark';
const KEY = 'overlap-theme';

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch { return 'light'; }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/**
 * Theme choice persisted in localStorage `overlap-theme` and applied to <html data-theme>.
 * The inline script in index.html applies the same rule before first paint, so there is no flash.
 * @returns [choice, setChoice]
 */
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  useEffect(() => {
    apply(choice);
    if (choice !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => apply('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [choice]);
  const setChoice = useCallback((c: ThemeChoice) => {
    try { window.localStorage.setItem(KEY, c); } catch { /* storage unavailable: still applies for this visit */ }
    setChoiceState(c);
  }, []);
  return [choice, setChoice];
}

/** Current resolved theme ('light' | 'dark'), updated when <html data-theme> changes. */
export function useResolvedTheme(): 'light' | 'dark' {
  const get = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [theme, setTheme] = useState<'light' | 'dark'>(get);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(get()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}
