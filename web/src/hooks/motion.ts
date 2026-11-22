// Shared motion primitives for the interaction hooks: one pointer tracker for all effects,
// a per-frame spring, and small math helpers. Ported from the overlap-landing.html prototype.

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Spring state: position `x` and velocity `v`. */
export interface Spring { x: number; v: number }

/**
 * Critically-damped-ish spring stepped once per frame.
 * @param state spring position/velocity, mutated in place
 * @param target value the spring moves toward
 * @param dt frame time in ms
 * @returns true while the spring is still moving
 */
export function stepSpring(state: Spring, target: number, dt: number, k = 0.08, d = 0.78): boolean {
  const f = dt / 16.67;
  state.v = (state.v + (target - state.x) * k * f) * Math.pow(d, f);
  state.x += state.v * f;
  return Math.abs(state.v) > 0.0005 || Math.abs(target - state.x) > 0.0005;
}

type Sub = () => void;

/** Last known mouse position (viewport px). Touch and pen are ignored: cursor effects are mouse-only. */
export const pointer: { x: number; y: number; active: boolean } = { x: -1e4, y: -1e4, active: false };
const subs = new Set<Sub>();
let listening = false;

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    subs.forEach((fn) => fn());
  }, { passive: true });
  document.addEventListener('mouseleave', () => {
    pointer.active = false; pointer.x = pointer.y = -1e4;
    subs.forEach((fn) => fn());
  });
}

/**
 * Subscribes to pointer moves through the single shared listener.
 * @returns unsubscribe function
 */
export function onPointer(fn: Sub): () => void {
  listen();
  subs.add(fn);
  return () => { subs.delete(fn); };
}
