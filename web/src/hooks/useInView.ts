import { useEffect, useState, type RefObject } from 'react';

/**
 * Reveal-once: becomes true the first time the element is at least `threshold` visible,
 * then stops observing. Never scroll-jacks. Without IntersectionObserver it is true at once.
 * @param ref element to watch
 * @param threshold fraction of the element that must be visible (0–1)
 */
export function useInView(ref: RefObject<Element | null>, threshold = 0.35): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, seen]);
  return seen;
}

/**
 * Live visibility (not once): true while the element is on screen and the tab is visible.
 * Continuous animations (globe, ripples, waves) use it to pause off-screen.
 */
export function useOnScreen(ref: RefObject<Element | null>, rootMargin = '80px'): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let inView = true;
    const update = () => setOn(inView && !document.hidden);
    const io = new IntersectionObserver((entries) => { inView = entries[0]?.isIntersecting ?? true; update(); }, { rootMargin });
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [ref, rootMargin]);
  return on;
}
