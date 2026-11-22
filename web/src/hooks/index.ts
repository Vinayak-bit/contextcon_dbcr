// Shared hooks. Interaction hooks are ported from the overlap-landing.html prototype; each one
// switches itself off with prefers-reduced-motion and (where cursor-driven) on touch devices.
export { useSpotlight } from './useSpotlight';
export { useMagnetic } from './useMagnetic';
export { useCursorWeight } from './useCursorWeight';
export { useReducedMotion, useFinePointer, useMediaQuery } from './useReducedMotion';
export { useInView, useOnScreen } from './useInView';
export { useTheme, useResolvedTheme, type ThemeChoice } from './useTheme';
export { useLocalStorage, usePolling } from './useStorage';
