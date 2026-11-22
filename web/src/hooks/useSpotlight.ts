import { useEffect, type RefObject } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Spotlight: a soft radial highlight and a brighter 1px gradient border that follow the mouse
 * inside a card, via the CSS custom properties --mx/--my/--o (styled by `.ui-spot`).
 * On touch, a tap lights the spot briefly. Disabled with reduced motion.
 * @param ref the card element (should carry the `ui-spot` class)
 * @param enabled set false to switch the effect off
 */
export function useSpotlight(ref: RefObject<HTMLElement | null>, enabled = true): void {
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--o', '0');
    if (!enabled || reduced) return;
    let timer = 0;
    const set = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    const move = (e: PointerEvent) => { if (e.pointerType === 'mouse') { set(e); el.style.setProperty('--o', '1'); } };
    const leave = (e: PointerEvent) => { if (e.pointerType === 'mouse') el.style.setProperty('--o', '0'); };
    const tap = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      set(e); el.style.setProperty('--o', '1');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.style.setProperty('--o', '0'), 700);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', tap);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', tap);
    };
  }, [ref, enabled, reduced]);
}
