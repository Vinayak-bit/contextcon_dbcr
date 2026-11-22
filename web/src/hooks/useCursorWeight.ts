import { useEffect, type RefObject } from 'react';
import { clamp, lerp, onPointer, pointer, stepSpring, type Spring } from './motion';
import { useFinePointer, useReducedMotion } from './useReducedMotion';

/**
 * Cursor-reactive headline: letters within `radius` px of the cursor ease from `min` to `max`
 * weight on Inter's variable axis and shift toward --accent-ink. Each glyph box is sized at `max`
 * weight up front, so the line never reflows. The heading keeps its text as aria-label; the split
 * glyphs are aria-hidden. Mouse-only; off with reduced motion or touch.
 * @param ref heading element containing plain text only
 */
export function useCursorWeight(ref: RefObject<HTMLElement | null>, { radius = 120, min = 540, max = 720 } = {}): void {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !fine) return;
    const text = (el.textContent || '').trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    const chars: { node: HTMLSpanElement; f: Spring; cx: number; cy: number }[] = [];
    text.split(' ').forEach((word, wi) => {
      if (wi) el.append(' ');
      const w = document.createElement('span');
      w.className = 'cw-word';
      w.setAttribute('aria-hidden', 'true');
      for (const c of word) {
        const s = document.createElement('span');
        s.className = 'cw-char';
        s.textContent = c;
        w.append(s);
        chars.push({ node: s, f: { x: 0, v: 0 }, cx: 0, cy: 0 });
      }
      el.append(w);
    });
    const measure = () => {
      chars.forEach((c) => { c.node.style.width = ''; c.node.style.fontWeight = String(max); });
      const r0 = el.getBoundingClientRect();
      chars.forEach((c) => {
        const r = c.node.getBoundingClientRect();
        c.node.style.width = `${r.width}px`;
        c.cx = r.left - r0.left + r.width / 2;
        c.cy = r.top - r0.top + r.height / 2;
      });
      chars.forEach((c) => { c.node.style.fontWeight = String(Math.round(lerp(min, max, c.f.x))); });
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      const dt = Math.min(48, t - (last || t)); last = t;
      const r0 = el.getBoundingClientRect();
      let moving = false;
      for (const c of chars) {
        const d = Math.hypot(pointer.x - (r0.left + c.cx), pointer.y - (r0.top + c.cy));
        const target = pointer.active ? Math.pow(clamp(1 - d / radius, 0, 1), 1.6) : 0;
        if (stepSpring(c.f, target, dt, 0.09, 0.72)) moving = true;
        const f = clamp(c.f.x, 0, 1);
        c.node.style.fontWeight = String(Math.round(lerp(min, max, f)));
        c.node.style.color = f > 0.01 ? `color-mix(in oklab, var(--ink), var(--accent-ink) ${Math.round(f * 60)}%)` : '';
      }
      raf = moving ? requestAnimationFrame(tick) : 0;
      if (!raf) last = 0;
    };
    const off = onPointer(() => { if (!raf) raf = requestAnimationFrame(tick); });
    return () => {
      off(); ro.disconnect(); cancelAnimationFrame(raf);
      el.textContent = text; el.removeAttribute('aria-label');
    };
  }, [ref, radius, min, max, reduced, fine]);
}
