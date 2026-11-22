import { useEffect, type RefObject } from 'react';
import { clamp, onPointer, pointer, stepSpring, type Spring } from './motion';
import { useFinePointer, useReducedMotion } from './useReducedMotion';

/**
 * Magnetic: the element drifts up to `max` px toward the cursor when the cursor is within
 * `radius` px of its edge, then springs back. Mouse-only; off with reduced motion or touch.
 * @param ref element to move (a primary CTA)
 */
export function useMagnetic(ref: RefObject<HTMLElement | null>, { radius = 80, max = 6 } = {}): void {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !fine) return;
    const sx: Spring = { x: 0, v: 0 };
    const sy: Spring = { x: 0, v: 0 };
    let raf = 0;
    let last = 0;
    const target = (): [number, number] => {
      if (!pointer.active) return [0, 0];
      const r = el.getBoundingClientRect();
      const nx = clamp(pointer.x, r.left, r.right);
      const ny = clamp(pointer.y, r.top, r.bottom);
      const edge = Math.hypot(pointer.x - nx, pointer.y - ny);
      if (edge > radius) return [0, 0];
      const dx = pointer.x - (r.left + r.width / 2);
      const dy = pointer.y - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const pull = max * (1 - edge / radius);
      return [(dx / len) * pull, (dy / len) * pull];
    };
    const tick = (t: number) => {
      const dt = Math.min(48, t - (last || t)); last = t;
      const [tx, ty] = target();
      const a = stepSpring(sx, tx, dt, 0.12, 0.7);
      const b = stepSpring(sy, ty, dt, 0.12, 0.7);
      el.style.transform = `translate3d(${sx.x.toFixed(2)}px,${sy.x.toFixed(2)}px,0)`;
      raf = a || b ? requestAnimationFrame(tick) : 0;
      if (!raf) last = 0;
    };
    const off = onPointer(() => { if (!raf) raf = requestAnimationFrame(tick); });
    return () => { off(); cancelAnimationFrame(raf); el.style.transform = ''; };
  }, [ref, radius, max, reduced, fine]);
}
