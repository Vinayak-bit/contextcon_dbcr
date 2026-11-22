// Page chrome: Logo, Header (acrylic glass), Footer (deep navy), ThemeToggle, DarkBand, PageWaves.
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode, RefObject } from 'react';
import { useReducedMotion, useTheme, type ThemeChoice } from '../../hooks';
import { clamp, lerp, smoothstep } from '../../hooks/motion';
import { cx } from './primitives';
import { Icon } from './icons';

/* --------------------------------------------------------------- Logo --- */
/**
 * Two 20 px circles (accent + teal, mix-blend-mode var(--blend)). With `scrollMerge`, they start
 * 24 px apart at scrollY 0 and smoothstep into the 8 px overlap over the first 220 px of scroll
 * (already overlapped with reduced motion).
 */
export function Logo({ scrollMerge = false }: { scrollMerge?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || !scrollMerge) return;
    const APART = 24, TOGETHER = 8, DIST = 220;
    let queued = false;
    const frame = () => {
      queued = false;
      const p = reduced ? 1 : clamp(window.scrollY / DIST, 0, 1);
      el.style.setProperty('--sep', `${lerp(APART, TOGETHER, smoothstep(p)).toFixed(2)}px`);
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    frame();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [scrollMerge, reduced]);
  return <span ref={ref} className="ui-logo" aria-hidden><i /><i /></span>;
}

/* -------------------------------------------------------- ThemeToggle --- */
const THEMES: { id: ThemeChoice; label: string; icon: 'sun' | 'monitor' | 'moon' }[] = [
  { id: 'light', label: 'Light theme', icon: 'sun' },
  { id: 'system', label: 'System theme', icon: 'monitor' },
  { id: 'dark', label: 'Dark theme', icon: 'moon' },
];
/** Light / system / dark switch, persisted in localStorage `overlap-theme`. */
export function ThemeToggle() {
  const [choice, setChoice] = useTheme();
  return (
    <div className="ui-theme-toggle" role="group" aria-label="Color theme">
      {THEMES.map((t) => (
        <button key={t.id} type="button" aria-pressed={choice === t.id} aria-label={t.label} title={t.label} onClick={() => setChoice(t.id)}>
          <Icon name={t.icon} />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Header --- */
/** A header navigation link: an in-page anchor or a click handler. */
export interface NavItem { label: string; href?: string; onClick?(e: MouseEvent<HTMLAnchorElement>): void }

/**
 * Sticky 64 px header with Fluent-style acrylic glass (tint + heavy blur + saturation + grain).
 * `nav` items show as links on desktop and in a menu button under 1024 px; `actions` sit on the right.
 */
export function Header({ onHome, nav = [], actions, mobileExtra }: { onHome(): void; nav?: NavItem[]; actions?: ReactNode; mobileExtra?: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const menuItems = [...nav, ...(mobileExtra ?? [])];
  const link = (n: NavItem, close = false) => (
    <a key={n.label} href={n.href ?? '#'} onClick={(e) => { if (n.onClick) { e.preventDefault(); n.onClick(e); } if (close) setOpen(false); }}>{n.label}</a>
  );
  return (
    <header className={cx('ui-header', scrolled && 'is-scrolled')}>
      <div className="wrap ui-header__bar">
        <a className="ui-brand" href="/" aria-label="Overlap home" onClick={(e) => { e.preventDefault(); onHome(); }}>
          <Logo scrollMerge />Overlap
        </a>
        {nav.length > 0 && <nav aria-label="Primary"><ul className="ui-header__links">{nav.map((n) => <li key={n.label}>{link(n)}</li>)}</ul></nav>}
        <div className="ui-header__right">
          {actions}
          {menuItems.length > 0 && (
            <button type="button" className="ui-menu-btn" aria-expanded={open} aria-controls="ui-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
              <Icon name={open ? 'close' : 'menu'} />
            </button>
          )}
        </div>
      </div>
      {menuItems.length > 0 && <div id="ui-mobile-menu" className={cx('ui-mobile-menu', open && 'is-open')}>{menuItems.map((n) => link(n, true))}</div>}
    </header>
  );
}

/* ------------------------------------------------------------- Footer --- */
/** Footer column. */
export interface FooterColumn { title: string; links: NavItem[] }

/** Deep navy footer with faint radial glows, link columns and the theme toggle. */
export function Footer({ columns, blurb, note, onHome }: { columns: FooterColumn[]; blurb: ReactNode; note: ReactNode; onHome(): void }) {
  return (
    <footer className="ui-footer">
      <div className="wrap">
        <div className="ui-footer__grid">
          <div>
            <a className="ui-brand" href="/" onClick={(e) => { e.preventDefault(); onHome(); }}><Logo />Overlap</a>
            <p className="ui-footer__blurb">{blurb}</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4>{col.title}</h4>
              <ul>{col.links.map((n) => <li key={n.label}><a href={n.href ?? '#'} onClick={(e) => { if (n.onClick) { e.preventDefault(); n.onClick(e); } }}>{n.label}</a></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="ui-footer__bottom">
          <span>{note}</span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------------------------------------- DarkBand --- */
/**
 * Dark band for ONE key explanatory section per page at most: hard edge from white into navy,
 * logo-coloured glows, faint column guides, and a long smoothstep fade back to the page.
 * The title is the Stripe two-tone headline: white lead + muted-blue continuation.
 */
export function DarkBand({ id, kicker, lead, continuation, children }: { id?: string; kicker: ReactNode; lead: ReactNode; continuation?: ReactNode; children: ReactNode }) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section className="ui-band-dark" id={id} aria-labelledby={hid}>
      <div className="wrap">
        <div className="ui-sec-head ui-sec-head--wide">
          <p className="kicker">{kicker}</p>
          <h2 id={hid} className="ui-split-h">{lead}{continuation && <> <span>{continuation}</span></>}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- PageWaves --- */
const WAVE_BANDS = [
  { base: 0.30, amp: 0.07, f: 1.6, sp: 1.0, c: [[76, 110, 245], [121, 80, 242]], a: 0.13 },
  { base: 0.52, amp: 0.09, f: 1.1, sp: -0.7, c: [[121, 80, 242], [18, 184, 134]], a: 0.11 },
  { base: 0.74, amp: 0.06, f: 2.0, sp: 0.55, c: [[76, 110, 245], [18, 184, 134]], a: 0.12 },
];

/**
 * Fixed background of three soft wave bands (blue→violet, violet→teal, blue→teal) with faint crest
 * lines. Drawn at ~30% resolution with a canvas blur and upscaled (cheap Gaussian look), drifting on
 * their own (~1 cycle/min, ≤30 fps), never scroll-linked. Hidden under `.ui-band-dark` sections and
 * fading back in where a band fades to white. With `after`, they fade in once past that element (the
 * landing hero). Static with reduced motion; paused when the tab is hidden.
 */
export function PageWaves({ after }: { after?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const SCALE = 0.3;
    let W = 0, H = 0, raf = 0, lastDraw = 0, shown = false;
    const rampStops = (a: number, b: number) => {
      const out: string[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; out.push(`rgba(0,0,0,${smoothstep(t).toFixed(3)}) ${(a + (b - a) * t).toFixed(0)}px`); }
      return out.join(',');
    };
    const draw = (t: number) => {
      const k = document.documentElement.dataset.theme === 'dark' ? 1.6 : 1;
      const ph = reduced ? 0 : t / 12000;
      ctx.clearRect(0, 0, W, H);
      ctx.filter = `blur(${W < 160 ? 2.6 : 5}px)`;
      for (const b of WAVE_BANDS) {
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, `rgba(${b.c[0]},${b.a * k})`); g.addColorStop(1, `rgba(${b.c[1]},${b.a * k})`);
        const yAt = (x: number) => H * (b.base + b.amp * Math.sin((x / W) * Math.PI * 2 * b.f + ph * b.sp * 3)
          + b.amp * 0.35 * Math.sin((x / W) * Math.PI * 2 * b.f * 2.3 - ph * b.sp * 2));
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 2) ctx.lineTo(x, yAt(x));
        ctx.lineTo(W, H); ctx.closePath();
        ctx.save(); ctx.fillStyle = g; ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 2) ctx.lineTo(x, yAt(x) + H * 0.27);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,.95)'; ctx.fill();
        ctx.restore();
        ctx.beginPath();
        for (let x = 0; x <= W; x += 2) { if (x) ctx.lineTo(x, yAt(x)); else ctx.moveTo(x, yAt(x)); }
        const gl = ctx.createLinearGradient(0, 0, W, 0);
        gl.addColorStop(0, `rgba(${b.c[0]},${b.a * 1.8 * k})`); gl.addColorStop(1, `rgba(${b.c[1]},${b.a * 1.8 * k})`);
        ctx.strokeStyle = gl; ctx.lineWidth = 1; ctx.stroke();
      }
    };
    const loop = (t: number) => {
      raf = 0;
      if (!shown || document.hidden || reduced) return;
      if (t - lastDraw > 33) { draw(t); lastDraw = t; }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (!raf && shown && !document.hidden && !reduced) raf = requestAnimationFrame(loop); };
    const size = () => {
      W = cv.width = Math.max(64, Math.round(window.innerWidth * SCALE));
      H = cv.height = Math.max(64, Math.round(window.innerHeight * SCALE));
      draw(performance.now());
    };
    const update = () => {
      const start = after?.current;
      let o = 1;
      if (start) { const end = start.offsetTop + start.offsetHeight; o = clamp((window.scrollY - end * 0.45) / (end * 0.5), 0, 1); }
      cv.style.opacity = o.toFixed(3);
      shown = o > 0;
      const bands = Array.from(document.querySelectorAll<HTMLElement>('.ui-band-dark'));
      const parts: string[] = [];
      let cursor = 0;
      for (const band of bands) {
        const r = band.getBoundingClientRect();
        if (r.top > window.innerHeight || r.bottom + 160 < 0) continue;
        const rampStart = r.top + r.height * 0.62, rampEnd = r.bottom + 160;
        parts.push(`#000 ${cursor.toFixed(0)}px`, `#000 ${r.top.toFixed(0)}px`, `transparent ${r.top.toFixed(0)}px`, rampStops(rampStart, rampEnd));
        cursor = rampEnd;
      }
      const m = parts.length ? `linear-gradient(to bottom,${parts.join(',')})` : 'none';
      cv.style.maskImage = m;
      cv.style.setProperty('-webkit-mask-image', m);
      wake();
    };
    const onResize = () => { size(); update(); };
    const onVis = () => wake();
    const mo = new MutationObserver(() => draw(performance.now()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    size(); update();
    return () => {
      cancelAnimationFrame(raf); mo.disconnect();
      window.removeEventListener('scroll', update); window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [after, reduced]);
  return <canvas ref={ref} className="ui-waves" aria-hidden />;
}
