// Line icons from the overlap-landing.html prototype (16/20 px grids, currentColor strokes).
import type { ReactElement, SVGProps } from 'react';

export type IconName = 'ext' | 'check' | 'x' | 'pin' | 'info' | 'warn' | 'arrow' | 'chev' | 'sun' | 'monitor' | 'moon' | 'menu' | 'close' | 'code' | 'paper' | 'talk' | 'patent';

const P: Record<IconName, { box: number; body: ReactElement }> = {
  ext: { box: 16, body: <path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> },
  check: { box: 20, body: <><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m6.5 10.2 2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></> },
  x: { box: 20, body: <><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m7.3 7.3 5.4 5.4m0-5.4-5.4 5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></> },
  pin: { box: 16, body: <><path d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="6.5" r="1.6" fill="currentColor" /></> },
  info: { box: 20, body: <><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10 9v5M10 6.2v.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></> },
  warn: { box: 20, body: <><path d="M10 2.8 18 17H2L10 2.8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M10 8v4.2M10 14.6v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></> },
  arrow: { box: 16, body: <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /> },
  chev: { box: 16, body: <path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> },
  sun: { box: 16, body: <><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></> },
  monitor: { box: 16, body: <><rect x="2" y="3" width="12" height="8.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></> },
  moon: { box: 16, body: <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /> },
  menu: { box: 18, body: <path d="M3 6h12M3 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
  close: { box: 18, body: <path d="m4.5 4.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
  code: { box: 16, body: <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="4.5" cy="3.5" r="1.5" /><circle cx="4.5" cy="12.5" r="1.5" /><circle cx="11.5" cy="5.5" r="1.5" /><path d="M4.5 5v6M11.5 7c0 3-7 2-7 4" /></g> },
  paper: { box: 16, body: <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M4 1.8h5.5L12.5 5v9.2H4z" /><path d="M6 8h4.5M6 10.5h4.5" strokeLinecap="round" /></g> },
  talk: { box: 16, body: <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="5.5" y="1.8" width="5" height="8" rx="2.5" /><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5v2" /></g> },
  patent: { box: 16, body: <g fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="6.5" r="4.3" /><path d="m5.6 10 -.9 4.4L8 13l3.3 1.4-.9-4.4" strokeLinejoin="round" /></g> },
};

/** Decorative line icon (aria-hidden). Size follows CSS (`.ui-icon` or the parent's rules). */
export function Icon({ name, className, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const { box, body } = P[name];
  return <svg viewBox={`0 0 ${box} ${box}`} className={className ? `ui-icon ${className}` : 'ui-icon'} aria-hidden="true" focusable="false" {...rest}>{body}</svg>;
}
