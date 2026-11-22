// Compatibility entry: the UI kit moved to web/src/components/ui (design system) and web/src/hooks.
// Existing feature code imports from here, so this re-exports both.
export * from '../components/ui';
export { useLocalStorage, usePolling } from '../hooks';
export type { Option, ButtonProps } from '../components/ui';
