// Hero background: the logo's two circles as soft radial fields (blue + teal) with concentric contour
// rings. Rings are born at each centre, travel outward ~11 px/s, fade in near the centre and fade out
// as the radius grows; the two sets are offset half a step so they interfere. Kept to the text column
// (masked out before the globe). ≤30 fps, only while on screen; static with reduced motion.
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks';

/** Ripple canvas for the landing hero. Decorative. */
export function HeroField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const base = document.createElement('canvas');
    const bctx = base.getContext('2d')!;
    type Centre = { x: number; y: number; c: number[]; ph: number };
    let W = 0, H = 0, dpr = 1, R = 0, k = 1, A: Centre | null = null, B: Centre | null = null;
    let raf = 0, last = 0, visible = true;
    const SPEED = 11;
    const layout = () => {
      const r = cv.getBoundingClientRect(); if (!r.width) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.width = base.width = Math.round(r.width * dpr); H = cv.height = base.height = Math.round(r.height * dpr);
      const mobile = r.width < 880;
      k = document.documentElement.dataset.theme === 'dark' ? 1.3 : 1;
      const unit = mobile ? W : Math.min(W, 1440 * dpr);
      const left = mobile ? 0 : (W - Math.min(W, 1168 * dpr)) / 2;
      R = unit * (mobile ? 0.62 : 0.26);
      A = { x: left - R * (mobile ? 0.25 : 0.2), y: H * (mobile ? 0.06 : 0.22), c: [76, 110, 245], ph: 0 };
      B = { x: A.x + R * 0.9, y: A.y + R * 0.6, c: [18, 184, 134], ph: 0.5 };
      bctx.clearRect(0, 0, W, H);
      for (const P of [A, B]) {
        const g = bctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, R);
        g.addColorStop(0, `rgba(${P.c},${0.14 * k})`); g.addColorStop(0.6, `rgba(${P.c},${0.07 * k})`); g.addColorStop(1, `rgba(${P.c},0)`);
        bctx.fillStyle = g; bctx.beginPath(); bctx.arc(P.x, P.y, R, 0, Math.PI * 2); bctx.fill();
      }
      bctx.save();
      bctx.beginPath(); bctx.arc(A.x, A.y, R * 0.92, 0, Math.PI * 2); bctx.clip();
      const lg = bctx.createRadialGradient((A.x + B.x) / 2, (A.y + B.y) / 2, 0, (A.x + B.x) / 2, (A.y + B.y) / 2, R * 0.7);
      lg.addColorStop(0, `rgba(121,80,242,${0.12 * k})`); lg.addColorStop(1, 'rgba(121,80,242,0)');
      bctx.fillStyle = lg; bctx.beginPath(); bctx.arc(B.x, B.y, R * 0.92, 0, Math.PI * 2); bctx.fill();
      bctx.restore();
      return true;
    };
    const draw = (t: number) => {
      if (!A || !B) return;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(base, 0, 0);
      const step = 14 * dpr, travel = (t / 1000) * SPEED * dpr;
      ctx.lineWidth = 0.8 * dpr;
      for (const P of [A, B]) {
        const off = (travel + P.ph * step) % step;
        for (let rr = off; rr < R * 1.05; rr += step) {
          if (rr < 0.5) continue;
          const born = Math.min(1, rr / (step * 2.5));
          const fade = Math.pow(Math.max(0, 1 - rr / R), 1.5);
          const a = 0.27 * k * born * fade;
          if (a < 0.004) continue;
          ctx.strokeStyle = `rgba(${P.c},${a.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(P.x, P.y, rr, 0, Math.PI * 2); ctx.stroke();
        }
      }
    };
    const loop = (t: number) => {
      raf = 0;
      if (!visible || document.hidden || reduced) return;
      if (t - last > 33) { draw(t); last = t; }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(loop); };
    const rebuild = () => { if (layout()) { draw(reduced ? 0 : performance.now()); wake(); } };
    const ro = new ResizeObserver(rebuild); ro.observe(cv);
    const mo = new MutationObserver(rebuild); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; wake(); }); io.observe(cv);
    document.addEventListener('visibilitychange', wake);
    rebuild();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', wake); };
  }, [reduced]);
  return <canvas ref={ref} />;
}
