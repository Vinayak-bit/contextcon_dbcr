// Evidence and scoring: EvidenceChip / EvidenceQuote / EvidenceClaim, ScoreRing, CriterionBar.
// The same pattern appears on the landing page and on real results.
import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFinePointer, useInView } from '../../hooks';
import { cx } from './primitives';
import { Icon } from './icons';

/** "2026-11-18 09:42 UTC" from an ISO timestamp, or null when it can't be parsed. */
export function formatUtc(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Evidence item as shown in a quote. */
/** `source` is a display label used when there is no link (e.g. illustrative sources on the landing page). */
export interface EvidenceView { id: string; text: string; url?: string; kind?: string; source?: string }

/** Mono "E1" chip. Controlled: the parent decides which quote is open. */
export function EvidenceChip({ id, expanded, controls, title, onToggle, onPeek }: { id: string; expanded: boolean; controls?: string; title?: string; onToggle(): void; onPeek?(open: boolean): void }) {
  const fine = useFinePointer();
  return (
    <button type="button" className="ui-chip-e" aria-expanded={expanded} aria-controls={controls} title={title}
      onClick={onToggle} onMouseEnter={() => fine && onPeek?.(true)}>
      {id}
    </button>
  );
}

const hostOf = (url: string) => { try { const u = new URL(url); return `${u.host}${u.pathname === '/' ? '' : u.pathname}`; } catch { return url; } };

/** Inline quote under a claim: 2 px accent left border on bg-2, source link and retrieval time. */
export function EvidenceQuote({ id, item, retrievedAt, open, domId }: { id: string; item?: EvidenceView; retrievedAt?: string; open: boolean; domId?: string }) {
  const when = formatUtc(retrievedAt);
  return (
    // Collapsed quotes stay in the DOM so the height can animate (grid rows 0fr → 1fr); `inert`
    // keeps their links out of the tab order and away from screen readers while closed.
    <div className={cx('ui-quote', open && 'is-open')} id={domId} inert={!open}>
      <div>
        {item ? (
          <>
            <blockquote>{item.text}</blockquote>
            <div className="ui-quote__src">
              <span className="mono">{id}{item.kind ? ` · ${item.kind.replace(/_/g, ' ')}` : ''}</span>
              {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{hostOf(item.url)} <Icon name="ext" /></a>
                : item.source ? <span className="ui-quote__label">{item.source}</span> : <span>No source link for this item</span>}
              {when && <span className="mono">retrieved {when}</span>}
            </div>
          </>
        ) : <blockquote>Evidence {id} isn't included in this record. Open ranking details for the full evidence list.</blockquote>}
      </div>
    </div>
  );
}

/**
 * A claim followed by its evidence chips. Hovering a chip (mouse) previews its quote; clicking pins
 * it open. Only one quote per claim is open at a time.
 */
export function EvidenceClaim({ children, ids, evidence, retrievedAt, as: Tag = 'div' }: { children: ReactNode; ids: string[]; evidence: Map<string, EvidenceView>; retrievedAt?: string; as?: 'div' | 'li' }) {
  const base = useId();
  const [pinned, setPinned] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const open = pinned ?? peek;
  return (
    <Tag className="ui-claim" onMouseLeave={() => setPeek(null)}>
      <span className="ui-claim__text">{children}</span>{' '}
      {ids.length ? ids.map((id) => {
        const e = evidence.get(id);
        return <EvidenceChip key={id} id={id} expanded={open === id} controls={`${base}-q`}
          title={e ? `${e.kind ?? 'evidence'}: ${e.text}` : 'Evidence not included in this record'}
          onToggle={() => setPinned((cur) => (cur === id ? null : id))} onPeek={(o) => !pinned && setPeek(o ? id : null)} />;
      }) : <span className="ui-ev-none">no evidence id</span>}
      <EvidenceQuote id={open ?? ''} item={open ? evidence.get(open) : undefined} retrievedAt={retrievedAt} open={Boolean(open)} domId={`${base}-q`} />
    </Tag>
  );
}

/** Overall score 0–100 as a ring with an accent→teal gradient stroke; fills once when scrolled into view. */
export function ScoreRing({ score, size = 76, label = 'Match score', caption }: { score: number; size?: number; label?: string; caption?: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, 0.4);
  const gid = useId().replace(/:/g, '');
  const stroke = Math.max(4, Math.round(size / 12.5));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <span ref={ref} className={cx('ui-score-ring', caption && 'has-caption')} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct)} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--teal)" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle className="ui-score-ring__val" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={seen ? c * (1 - pct / 100) : c} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b className="ui-score-ring__value" style={{ fontSize: Math.max(13, Math.round(size * 0.29)) }}>{Math.round(pct)}</b>
      {caption && <small className="ui-score-ring__caption mono">{caption}</small>}
    </span>
  );
}

/**
 * One rubric criterion: 6 px accent→teal bar that fills once in view.
 * `value` is 0–5 (or set `max`); `meta` overrides the mono value text.
 * `layout="inline"` puts label | bar | value on one row (short labels only).
 */
export function CriterionBar({ label, value, max = 5, weight, source, meta, layout = 'stacked' }: { label: ReactNode; value: number; max?: number; weight?: number; source?: string; meta?: ReactNode; layout?: 'stacked' | 'inline' }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.3);
  const pct = (Math.max(0, Math.min(max, value)) / max) * 100;
  const text = meta ?? <>{value.toFixed(1)}/{max}{weight !== undefined && <> · {Math.round(weight)}%</>}{source && <> · {source}</>}</>;
  return (
    <div ref={ref} className={cx('ui-criterion', `ui-criterion--${layout}`)}>
      <span className="ui-criterion__label">{label}</span>
      <span className="ui-criterion__track" aria-hidden><span className="ui-criterion__fill" style={{ width: seen ? `${pct}%` : 0 }} /></span>
      <span className="ui-criterion__meta mono">{text}</span>
    </div>
  );
}
/** Alias kept for existing code. */
export const ScoreBar = CriterionBar;
