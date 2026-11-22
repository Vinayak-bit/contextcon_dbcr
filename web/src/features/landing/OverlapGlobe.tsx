// OverlapGlobe — dot-matrix globe on a 2D canvas (orthographic projection), ported from the
// overlap-landing.html prototype. Arcs fly from "you" to illustrative expert points and land as two
// overlapping circles (the logo motif). The geography filter dims points outside the selection and
// stops their arcs: geography is a hard filter. Runs only while on screen and the tab is visible;
// static with reduced motion. Zero dependencies.
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks';
import { clamp, easeOut, lerp, stepSpring, type Spring } from '../../hooks/motion';
import { LAND_B64 } from './globe-land';

/** Geography filter shown under the globe. */
export type GlobeFilter = 'world' | 'countries' | 'hubs' | 'city';
/** Summary the globe reports whenever the filter changes. */
export interface GlobeFilterInfo { inScope: number; total: number; label: string }

const DEG = Math.PI / 180;
const YOU = { lat: 12.97, lon: 77.59, place: 'Bengaluru' };
const COUNTRY_SET = { codes: ['DE', 'JP', 'CA'], label: 'Germany, Japan and Canada' };
type Src = 'code' | 'paper' | 'talk' | 'patent';
interface Expert { lat: number; lon: number; cc: string; hub: 0 | 1; city?: 1; place: string; role: string; topic: string; ev: string; src: Src }

/* All entries fictional and illustrative. */
const EXPERTS: Expert[] = [
  { lat: 47.37, lon: 8.54, cc: 'CH', hub: 1, place: 'Zürich, Switzerland', role: 'Research Engineer', topic: 'paged attention', ev: 'Implemented a quantized KV-cache allocator for an open serving runtime…', src: 'code' },
  { lat: 37.44, lon: -122.14, cc: 'US', hub: 1, place: 'Bay Area, United States', role: 'Staff Engineer', topic: 'GPU kernel fusion', ev: 'Wrote fused attention kernels that cut decode latency by a third…', src: 'code' },
  { lat: 42.36, lon: -71.09, cc: 'US', hub: 1, place: 'Boston, United States', role: 'Postdoc', topic: 'soft robotic grippers', ev: 'Designed silicone actuators with embedded strain sensing…', src: 'paper' },
  { lat: 52.2, lon: 0.12, cc: 'GB', hub: 1, place: 'Cambridge, United Kingdom', role: 'PhD Researcher', topic: 'inverse protein folding', ev: 'Benchmarked inverse-folding models on designed binders…', src: 'paper' },
  { lat: 48.14, lon: 11.58, cc: 'DE', hub: 0, place: 'Munich, Germany', role: 'Controls Engineer', topic: 'sim-to-real locomotion', ev: 'Transferred quadruped gaits from simulation using domain randomization…', src: 'talk' },
  { lat: 52.52, lon: 13.4, cc: 'DE', hub: 0, place: 'Berlin, Germany', role: 'ML Engineer', topic: 'federated learning', ev: 'Ran federated training across four hospital sites with non-IID data…', src: 'paper' },
  { lat: 35.68, lon: 139.69, cc: 'JP', hub: 1, place: 'Tokyo, Japan', role: 'Research Scientist', topic: 'tactile sensing', ev: 'Built a vision-based tactile sensor for in-hand manipulation…', src: 'paper' },
  { lat: 34.69, lon: 135.5, cc: 'JP', hub: 0, place: 'Osaka, Japan', role: 'Hardware Engineer', topic: 'battery management', ev: 'Designed a cell-balancing BMS for 48 V packs…', src: 'patent' },
  { lat: 43.65, lon: -79.38, cc: 'CA', hub: 1, place: 'Toronto, Canada', role: 'Professor', topic: 'graph neural networks', ev: 'Proposed a message-passing scheme for molecular property prediction…', src: 'paper' },
  { lat: 45.5, lon: -73.57, cc: 'CA', hub: 0, place: 'Montréal, Canada', role: 'Research Engineer', topic: 'low-resource ASR', ev: 'Fine-tuned speech recognition for twelve low-resource languages…', src: 'code' },
  { lat: 22.54, lon: 114.06, cc: 'CN', hub: 1, place: 'Shenzhen, China', role: 'Firmware Engineer', topic: 'GPS-denied flight', ev: 'Contributed a state-estimator patch for flight without GPS…', src: 'code' },
  { lat: 1.35, lon: 103.82, cc: 'SG', hub: 1, place: 'Singapore', role: 'Research Fellow', topic: 'LiDAR SLAM', ev: 'Released a loop-closure module for dense urban mapping…', src: 'code' },
  { lat: -23.55, lon: -46.63, cc: 'BR', hub: 0, place: 'São Paulo, Brazil', role: 'Data Engineer', topic: 'exactly-once streaming', ev: 'Migrated a daily batch ingest to exactly-once streaming…', src: 'talk' },
  { lat: -1.29, lon: 36.82, cc: 'KE', hub: 0, place: 'Nairobi, Kenya', role: 'Research Engineer', topic: 'on-device crop disease detection', ev: 'Deployed offline leaf-disease classifiers on low-cost phones…', src: 'paper' },
  { lat: -33.87, lon: 151.21, cc: 'AU', hub: 0, place: 'Sydney, Australia', role: 'Postdoc', topic: 'surface-code decoding', ev: 'Evaluated surface-code decoders on noisy hardware traces…', src: 'paper' },
  { lat: 32.08, lon: 34.78, cc: 'IL', hub: 1, place: 'Tel Aviv, Israel', role: 'Security Researcher', topic: 'firmware fuzzing', ev: 'Built a coverage-guided fuzzer for embedded bootloaders…', src: 'talk' },
  { lat: 47.61, lon: -122.33, cc: 'US', hub: 1, place: 'Seattle, United States', role: 'Applied Scientist', topic: 'sequential recommenders', ev: 'Shipped a session-based ranking model to production…', src: 'paper' },
  { lat: 13.42, lon: 77.05, cc: 'IN', hub: 0, city: 1, place: 'Bengaluru, India', role: 'Senior Engineer', topic: 'vector search', ev: 'Built an HNSW index service and published its benchmarks…', src: 'code' },
  { lat: 12.42, lon: 78.05, cc: 'IN', hub: 0, city: 1, place: 'Bengaluru, India', role: 'Research Engineer', topic: 'OCR for Indic scripts', ev: 'Trained a multi-script OCR model on scanned archives…', src: 'paper' },
  { lat: 13.6, lon: 78.2, cc: 'IN', hub: 0, city: 1, place: 'Bengaluru, India', role: 'Founder', topic: 'edge LLM inference', ev: 'Ported a 7B model to an embedded GPU board…', src: 'talk' },
];

const FILTERS: Record<GlobeFilter, { test(e: Expert): boolean; focus: number | null; label: string }> = {
  world: { test: () => true, focus: null, label: 'No geographic filter applied.' },
  countries: { test: (e) => COUNTRY_SET.codes.includes(e.cc), focus: 60, label: `Only ${COUNTRY_SET.label}. Everyone else is excluded, not down-ranked.` },
  hubs: { test: (e) => Boolean(e.hub), focus: null, label: 'Research hubs only. Points elsewhere are excluded from results.' },
  city: { test: (e) => Boolean(e.city), focus: YOU.lon, label: `Only ${YOU.place}. If that’s too few, Overlap asks before widening.` },
};
const SRC_LABEL: Record<Src, string> = { code: 'code repository', paper: 'paper', talk: 'talk', patent: 'patent' };
const SRC_ICON: Record<Src, string> = {
  code: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M4.5 5v6M11.5 7c0 3-7 2-7 4"/></svg>',
  paper: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 1.8h5.5L12.5 5v9.2H4z"/><path d="M6 8h4.5M6 10.5h4.5" stroke-linecap="round"/></svg>',
  talk: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="5.5" y="1.8" width="5" height="8" rx="2.5"/><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5v2"/></svg>',
  patent: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="6.5" r="4.3"/><path d="m5.6 10 -.9 4.4L8 13l3.3 1.4-.9-4.4" stroke-linejoin="round"/></svg>',
};

type V3 = [number, number, number];
const ll2v = (lat: number, lon: number): V3 => { const la = lat * DEG, lo = lon * DEG, c = Math.cos(la); return [c * Math.sin(lo), Math.sin(la), c * Math.cos(lo)]; };

let LAND: Float32Array | null = null;
function decodeLand(): Float32Array {
  if (LAND) return LAND;
  const bin = atob(LAND_B64), N = 16000, GA = Math.PI * (3 - Math.sqrt(5)), pts: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!(bin.charCodeAt(i >> 3) & (1 << (i & 7)))) continue;
    const y = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - y * y), th = GA * i;
    pts.push(...ll2v(Math.asin(y) / DEG, Math.atan2(Math.sin(th) * r, Math.cos(th) * r) / DEG));
  }
  LAND = new Float32Array(pts);
  return LAND;
}

interface Arc { i: number; pts: Float32Array; n: number; t0: number; draw: number; hold: number; retract: number; alpha: number; dying: boolean; done?: boolean }
interface GlobeApi { setFilter(f: GlobeFilter): void; setReduced(r: boolean): void; destroy(): void }

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function createGlobe(stage: HTMLElement, canvas: HTMLCanvasElement, card: HTMLElement, opts: { filter: GlobeFilter; reduced: boolean; onFilterInfo(i: GlobeFilterInfo): void }): GlobeApi {
  const ctx = canvas.getContext('2d')!;
  let filter = opts.filter;
  let REDUCED = opts.reduced;
  const land = decodeLand(), NL = land.length / 3;
  const you = ll2v(YOU.lat, YOU.lon);
  const ex = EXPERTS.map((e) => ({ ...e, v: ll2v(e.lat, e.lon), a: 1, glow: 0, sx: 0, sy: 0, sz: -1, active: false }));
  let W = 0, H = 0, R = 0, dpr = 1;
  let colors = { dot: '', accent: '', teal: '', rim: '', fill: '', blend: 'multiply' as GlobalCompositeOperation, halo: '' };
  let rotY = -40 * DEG, rotX = 0.32;
  const autoSpeed = 0.022;
  const tiltY: Spring = { x: 0, v: 0 }, tiltX: Spring = { x: 0, v: 0 };
  let tTiltY = 0, tTiltX = 0, inertia = 0, focusLon: number | null = null;
  let arcs: Arc[] = [], spawnAt = 0, hovered = -1, kbIndex = -1;
  let dragging: { x: number; y: number; moved: number; t: number } | null = null;
  let visible = true, raf = 0, last = 0, now = 0, shown = -1;

  const inScope = (e: Expert) => FILTERS[filter].test(e);
  function readColors() {
    const dark = document.documentElement.dataset.theme === 'dark';
    colors = { dot: dark ? '120,134,170' : '96,108,140', accent: css('--accent'), teal: css('--teal'),
      rim: dark ? 'rgba(145,167,255,.16)' : 'rgba(76,110,245,.14)', fill: dark ? 'rgba(76,110,245,.05)' : 'rgba(76,110,245,.035)',
      blend: dark ? 'screen' : 'multiply', halo: dark ? 'rgba(18,184,134,.22)' : 'rgba(18,184,134,.20)' };
  }
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.width = Math.round(r.width * dpr); H = canvas.height = Math.round(r.height * dpr);
    R = (Math.min(W, H) / 2) * 0.78;
    requestFrame();
  }
  const rot = (x: number, y: number, z: number, cy: number, sy: number, cx: number, sx: number): V3 => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
  };
  function makeArc(i: number, t: number): Arc {
    const b = ex[i].v, d = clamp(you[0] * b[0] + you[1] * b[1] + you[2] * b[2], -1, 1), w = Math.acos(d);
    const h = clamp(w * 0.28, 0.07, 0.26), n = 56, pts = new Float32Array(n * 3), s = Math.sin(w) || 1;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1), A = Math.sin((1 - u) * w) / s, B = Math.sin(u * w) / s, lift = 1 + h * Math.sin(Math.PI * u);
      pts[k * 3] = (A * you[0] + B * b[0]) * lift; pts[k * 3 + 1] = (A * you[1] + B * b[1]) * lift; pts[k * 3 + 2] = (A * you[2] + B * b[2]) * lift;
    }
    const dur = 1500 + w * 700 + Math.random() * 400;
    ex[i].active = true;
    return { i, pts, n, t0: t, draw: dur, hold: 900, retract: dur * 0.55, alpha: 1, dying: false };
  }
  function spawn(t: number) {
    const live = arcs.filter((a) => !a.dying).length;
    const pool = ex.map((_, i) => i).filter((i) => inScope(ex[i]) && !ex[i].active);
    const target = Math.min(8, Math.max(1, pool.length + live));
    if (live < target && pool.length && t >= spawnAt) {
      arcs.push(makeArc(pool[(Math.random() * pool.length) | 0], t));
      spawnAt = t + 380 + Math.random() * 420;
    }
  }
  function render(dt: number) {
    const tY = rotY + tiltY.x, tX = clamp(rotX + tiltX.x, -0.7, 1.0);
    const cy = Math.cos(tY), sy = Math.sin(tY), cx = Math.cos(tX), sx = Math.sin(tX);
    const ox = W / 2, oy = H / 2;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(ox - R * 0.3, oy - R * 0.35, R * 0.1, ox, oy, R);
    g.addColorStop(0, colors.fill); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors.rim; ctx.lineWidth = dpr; ctx.stroke();
    const buckets = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const ds = 1.7 * dpr;
    for (let k = 0; k < NL; k++) {
      const x = land[k * 3], y = land[k * 3 + 1], z = land[k * 3 + 2];
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, z2 = y * sx + z1 * cx;
      if (z2 <= 0.02) continue;
      const y2 = y * cx - z1 * sx;
      const b = Math.min(4, (z2 * 5) | 0), s = ds * (0.65 + 0.35 * z2);
      buckets[b].rect(ox + x1 * R - s / 2, oy - y2 * R - s / 2, s, s);
    }
    for (let b = 0; b < 5; b++) { ctx.fillStyle = `rgba(${colors.dot},${(0.18 + b * 0.16).toFixed(2)})`; ctx.fill(buckets[b]); }

    const P = (px: number, py: number, pz: number) => rot(px, py, pz, cy, sy, cx, sx);
    const youP = P(you[0], you[1], you[2]);
    ctx.lineCap = 'round';
    for (const a of arcs) {
      const el = now - a.t0;
      const head = REDUCED ? 1 : easeOut(clamp(el / a.draw, 0, 1));
      const tail = REDUCED ? 0 : easeOut(clamp((el - a.draw - a.hold) / a.retract, 0, 1));
      if (a.dying) a.alpha = Math.max(0, a.alpha - dt / 300);
      const e = ex[a.i], bP = P(e.v[0], e.v[1], e.v[2]);
      const grad = ctx.createLinearGradient(ox + youP[0] * R, oy - youP[1] * R, ox + bP[0] * R, oy - bP[1] * R);
      grad.addColorStop(0, colors.accent); grad.addColorStop(1, colors.teal);
      ctx.strokeStyle = grad; ctx.lineWidth = 1.5 * dpr; ctx.globalAlpha = a.alpha * 0.95;
      const k0 = Math.floor(tail * (a.n - 1)), k1 = Math.ceil(head * (a.n - 1));
      ctx.beginPath(); let pen = false, hx = 0, hy = 0, hv = false;
      for (let k = k0; k <= k1; k++) {
        const r = P(a.pts[k * 3], a.pts[k * 3 + 1], a.pts[k * 3 + 2]);
        const vis = r[2] > 0 || r[0] * r[0] + r[1] * r[1] > 1;
        const X = ox + r[0] * R, Y = oy - r[1] * R;
        if (vis) { if (pen) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); pen = true; hx = X; hy = Y; hv = true; } else { pen = false; hv = false; }
      }
      ctx.stroke();
      if (head < 1 && hv) { ctx.fillStyle = colors.teal; ctx.beginPath(); ctx.arc(hx, hy, 1.8 * dpr, 0, Math.PI * 2); ctx.fill(); }
      const landT = REDUCED ? 1 : clamp((el - a.draw * 0.92) / 520, 0, 1);
      if (landT > 0 && bP[2] > 0.05 && tail < 1) {
        const X = ox + bP[0] * R, Y = oy - bP[1] * R, sep = lerp(9, 3.6, easeOut(landT)) * dpr, rr = 3.4 * dpr;
        ctx.globalAlpha = a.alpha * Math.min(1, landT * 2) * (1 - tail);
        ctx.globalCompositeOperation = colors.blend;
        ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(X - sep / 2, Y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.teal; ctx.beginPath(); ctx.arc(X + sep / 2, Y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        if (landT > 0.5) e.glow = 1;
      }
      ctx.globalAlpha = 1;
      if (!REDUCED && (tail >= 1 || a.alpha <= 0)) { a.done = true; e.active = false; }
    }
    if (!REDUCED) arcs = arcs.filter((a) => !a.done);

    for (let i = 0; i < ex.length; i++) {
      const e = ex[i], r = P(e.v[0], e.v[1], e.v[2]);
      e.sx = (ox + r[0] * R) / dpr; e.sy = (oy - r[1] * R) / dpr; e.sz = r[2];
      const target = inScope(e) ? 1 : 0.15;
      e.a = REDUCED ? target : lerp(e.a, target, Math.min(1, dt / 160));
      e.glow = Math.max(0, e.glow - dt / 2600);
      if (r[2] <= 0.02) continue;
      const X = ox + r[0] * R, Y = oy - r[1] * R, depth = 0.55 + 0.45 * r[2];
      if (e.glow > 0 && inScope(e)) { ctx.fillStyle = colors.halo; ctx.globalAlpha = e.glow * depth; ctx.beginPath(); ctx.arc(X, Y, (5 + 4 * e.glow) * dpr, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = e.a * depth;
      ctx.fillStyle = colors.teal; ctx.beginPath(); ctx.arc(X, Y, (i === hovered ? 3.6 : 2.6) * dpr, 0, Math.PI * 2); ctx.fill();
      if (i === hovered) { ctx.strokeStyle = colors.teal; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.arc(X, Y, 7 * dpr, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (youP[2] > 0.02) {
      const X = ox + youP[0] * R, Y = oy - youP[1] * R;
      const pulse = REDUCED ? 0.4 : (now / 2400) % 1;
      ctx.strokeStyle = colors.accent; ctx.globalAlpha = 0.6 * (1 - pulse); ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.arc(X, Y, (4 + pulse * 12) * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(X, Y, 4 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X, Y, 1.5 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    positionCard();
  }

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  function cardHTML(e: (typeof ex)[number]) {
    const scoped = inScope(e);
    return `<div class="lp-gc-top"><span class="lp-gc-role">${esc(e.role)}</span><span class="ui-tag-ill">Illustrative</span></div>`
      + `<div class="lp-gc-topic">${esc(e.topic)}</div>`
      + `<div class="lp-gc-ev">${SRC_ICON[e.src]}<span>“${esc(e.ev)}” <span class="sr-only">(source: ${SRC_LABEL[e.src]})</span><span aria-hidden="true">↗</span></span></div>`
      + `<div class="lp-gc-loc">${esc(e.place)}${scoped ? '' : ' · outside current filter, excluded'}</div>`;
  }
  function showCard(i: number) {
    if (i === shown) return; shown = i;
    if (i < 0) { card.classList.remove('is-shown'); return; }
    card.innerHTML = cardHTML(ex[i]); card.classList.add('is-shown'); positionCard();
  }
  function positionCard() {
    if (shown < 0) return;
    const e = ex[shown];
    if (e.sz <= 0.02) { card.classList.remove('is-shown'); return; }
    card.classList.add('is-shown');
    const sw = W / dpr, cw = card.offsetWidth, ch = card.offsetHeight;
    const L = clamp(e.sx - cw / 2, -8, sw - cw + 8);
    let T = e.sy - ch - 16;
    if (T < -10) T = e.sy + 16;
    card.style.transform = `translate3d(${L.toFixed(1)}px,${T.toFixed(1)}px,0)`;
  }
  function hit(px: number, py: number) {
    let best = -1, bd = 18;
    ex.forEach((e, i) => { if (e.sz > 0.05) { const d = Math.hypot(e.sx - px, e.sy - py); if (d < bd) { bd = d; best = i; } } });
    return best;
  }

  const hero = (stage.closest('section') as HTMLElement | null) ?? stage;
  const onHeroMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || REDUCED) return;
    const r = stage.getBoundingClientRect();
    tTiltY = clamp((e.clientX - (r.left + r.width / 2)) / (r.width * 0.9), -1, 1) * 12 * DEG;
    tTiltX = clamp((e.clientY - (r.top + r.height / 2)) / (r.height * 0.9), -1, 1) * 12 * DEG;
    requestFrame();
  };
  const onHeroLeave = () => { tTiltY = 0; tTiltX = 0; requestFrame(); };
  const local = (e: PointerEvent): [number, number] => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onMove = (e: PointerEvent) => {
    if (dragging) {
      const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
      dragging.x = e.clientX; dragging.y = e.clientY; dragging.moved += Math.abs(dx) + Math.abs(dy);
      const k = 1 / (R / dpr);
      rotY += dx * k; rotX = clamp(rotX + dy * k, -0.6, 0.9);
      inertia = ((dx * k) / Math.max(8, e.timeStamp - (dragging.t || e.timeStamp))) * 16; dragging.t = e.timeStamp;
      focusLon = null; requestFrame(); return;
    }
    if (e.pointerType !== 'mouse') return;
    const [x, y] = local(e), i = hit(x, y);
    if (i !== hovered) { hovered = i; showCard(i); requestFrame(); }
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = { x: e.clientX, y: e.clientY, moved: 0, t: e.timeStamp };
    stage.setPointerCapture(e.pointerId); stage.classList.add('is-dragging');
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    const tap = dragging.moved < 6; dragging = null; stage.classList.remove('is-dragging');
    if (tap) { const [x, y] = local(e), i = hit(x, y); hovered = i; showCard(i); inertia = 0; }
    requestFrame();
  };
  const onLeave = (e: PointerEvent) => { if (!dragging && e.pointerType === 'mouse') { hovered = -1; showCard(-1); requestFrame(); } };
  const onKey = (e: KeyboardEvent) => {
    const order = ex.map((_, i) => i).filter((i) => inScope(ex[i]));
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const pos = order.indexOf(kbIndex), step = e.key === 'ArrowRight' ? 1 : -1;
      kbIndex = order[(pos + step + order.length) % order.length] ?? order[0];
      focusLon = ex[kbIndex].lon; hovered = kbIndex; showCard(kbIndex); requestFrame();
    } else if (e.key === 'Escape') { hovered = -1; kbIndex = -1; showCard(-1); requestFrame(); }
  };
  const onBlur = () => { hovered = -1; showCard(-1); requestFrame(); };
  hero.addEventListener('pointermove', onHeroMove); hero.addEventListener('pointerleave', onHeroLeave);
  stage.addEventListener('pointermove', onMove); stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp); stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('keydown', onKey); stage.addEventListener('blur', onBlur);

  function step(t: number) {
    raf = 0;
    const dt = Math.min(50, t - (last || t)); last = t; now = t;
    let busy = false;
    if (!REDUCED) {
      busy = true;
      if (!dragging) {
        if (focusLon !== null) {
          const target = -focusLon * DEG;
          const d = (((target - rotY) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
          rotY += d * Math.min(1, dt / 500);
          if (Math.abs(d) < 0.002 && hovered < 0) focusLon = null;
        } else {
          rotY += (autoSpeed * (hovered >= 0 ? 0 : 1) * dt) / 1000 + inertia; inertia *= Math.pow(0.92, dt / 16.67);
        }
      }
      stepSpring(tiltY, tTiltY, dt, 0.05, 0.8); stepSpring(tiltX, tTiltX, dt, 0.05, 0.8);
      spawn(t);
    }
    render(dt);
    if (busy && visible && !document.hidden) raf = requestAnimationFrame(step); else last = 0;
  }
  function requestFrame() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(step); }
  function staticArcs() {
    arcs = []; ex.forEach((e) => { e.active = false; });
    ex.forEach((e, i) => { if (inScope(e)) { arcs.push(makeArc(i, 0)); e.glow = 0; } });
  }

  const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; if (visible) requestFrame(); }, { rootMargin: '80px' });
  io.observe(stage);
  const onVis = () => { if (!document.hidden) requestFrame(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize); ro.observe(stage);
  const mo = new MutationObserver(() => { readColors(); requestFrame(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  readColors(); resize();

  const api: GlobeApi = {
    setFilter(f) {
      filter = f;
      arcs.forEach((a) => { if (!inScope(ex[a.i])) a.dying = true; });
      const fo = FILTERS[f].focus; if (fo !== null) focusLon = fo;
      if (REDUCED) staticArcs();
      if (shown >= 0) card.innerHTML = cardHTML(ex[shown]);
      opts.onFilterInfo({ inScope: ex.filter(inScope).length, total: ex.length, label: FILTERS[f].label });
      requestFrame();
    },
    setReduced(r) {
      REDUCED = r;
      if (r) { rotY = -40 * DEG; rotX = 0.32; tiltX.x = tiltY.x = 0; staticArcs(); } else { arcs = []; ex.forEach((e) => { e.active = false; }); }
      requestFrame();
    },
    destroy() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      hero.removeEventListener('pointermove', onHeroMove); hero.removeEventListener('pointerleave', onHeroLeave);
      stage.removeEventListener('pointermove', onMove); stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp); stage.removeEventListener('pointercancel', onUp); stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('keydown', onKey); stage.removeEventListener('blur', onBlur);
    },
  };
  if (REDUCED) staticArcs();
  api.setFilter(filter);
  return api;
}

/**
 * The hero globe. Drag to rotate, hover (or arrow keys when focused) to inspect a point.
 * @param filter which illustrative experts are in scope
 * @param onFilterInfo called with "N of M in scope" and the explanation whenever the filter changes
 */
export function OverlapGlobe({ filter = 'world', onFilterInfo, describedBy }: { filter?: GlobeFilter; onFilterInfo?(info: GlobeFilterInfo): void; describedBy?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const api = useRef<GlobeApi | null>(null);
  const info = useRef(onFilterInfo);
  info.current = onFilterInfo;
  const reduced = useReducedMotion();
  const initial = useRef({ filter, reduced });

  useEffect(() => {
    if (!stage.current || !canvas.current || !card.current) return;
    api.current = createGlobe(stage.current, canvas.current, card.current, { ...initial.current, onFilterInfo: (i) => info.current?.(i) });
    return () => { api.current?.destroy(); api.current = null; };
  }, []);
  useEffect(() => { api.current?.setFilter(filter); }, [filter]);
  useEffect(() => { api.current?.setReduced(reduced); }, [reduced]);

  return (
    <div ref={stage} className="lp-globe" tabIndex={0} role="img" aria-describedby={describedBy}
      aria-label="Illustrative globe: arcs connect you to experts worldwide. Use left and right arrow keys to inspect expert points.">
      <canvas ref={canvas} />
      <div ref={card} className="lp-globe-card" aria-live="polite" />
    </div>
  );
}
