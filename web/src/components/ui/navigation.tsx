// Navigation controls: Tabs (underline), SegmentedControl, Stepper, Drawer.
// Tabs and the segmented control implement the ARIA tablist / radiogroup patterns with arrow keys.
import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from './primitives';
import { Icon } from './icons';

function rovingKey(e: KeyboardEvent, index: number, count: number, vertical = false): number | null {
  const next: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ...(vertical ? { ArrowDown: 1, ArrowUp: -1 } : {}) };
  if (e.key in next) return (index + next[e.key] + count) % count;
  if (e.key === 'Home') return 0;
  if (e.key === 'End') return count - 1;
  return null;
}

/**
 * Tabs with a 2 px accent underline indicator. Arrow keys / Home / End move between tabs.
 * Pass `panelId(key)` to link each tab to its tabpanel via aria-controls.
 */
export function Tabs<K extends string>({ tabs, value, onChange, label, panelId }: { tabs: { key: K; label: ReactNode; count?: number }[]; value: K; onChange(k: K): void; label?: string; panelId?(k: K): string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const onKey = (e: KeyboardEvent, i: number) => {
    const j = rovingKey(e, i, tabs.length);
    if (j === null) return;
    e.preventDefault();
    onChange(tabs[j].key);
    refs.current[j]?.focus();
  };
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.key} ref={(el) => { refs.current[i] = el; }} id={`${base}-${t.key}`} type="button" role="tab"
          aria-selected={t.key === value} aria-controls={panelId?.(t.key)} tabIndex={t.key === value ? 0 : -1}
          className={cx('ui-tab', t.key === value && 'is-active')} onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}{t.count !== undefined && <span className="ui-tab__count mono">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Segmented control: bg-2 track, active item raised (surface + sh-1). ARIA radiogroup with arrow keys. */
export function SegmentedControl<K extends string>({ options, value, onChange, label, size = 'md' }: { options: { id: K; label: ReactNode }[]; value: K; onChange(k: K): void; label: string; size?: 'sm' | 'md' }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const j = rovingKey(e, i, options.length, true);
    if (j === null) return;
    e.preventDefault();
    onChange(options[j].id);
    refs.current[j]?.focus();
  };
  return (
    <div className={cx('ui-seg', size === 'sm' && 'ui-seg--sm')} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o.id} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1} onClick={() => onChange(o.id)} onKeyDown={(e) => onKey(e, i)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Step indicator with mono step numbers (01, 02 …). Completed steps can be revisited. */
export function Stepper<K extends string>({ steps, current, completed = [], onSelect }: { steps: { key: K; label: string }[]; current: K; completed?: K[]; onSelect?(k: K): void }) {
  return (
    <ol className="ui-stepper">
      {steps.map((s, i) => {
        const done = completed.includes(s.key); const active = s.key === current;
        const clickable = Boolean(onSelect) && (done || active);
        return (
          <li key={s.key} className={cx('ui-step', active && 'is-active', done && 'is-done')}>
            <button type="button" disabled={!clickable} onClick={() => onSelect?.(s.key)} aria-current={active ? 'step' : undefined}>
              <span className="ui-step__num mono">{done && !active ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <span className="ui-step__label">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Side drawer (full-screen on phones). Traps focus, Esc closes, focus returns to the opener. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose(): void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ui-drawer-root">
      <div className="ui-drawer-backdrop" onClick={onClose} />
      <div className="ui-drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} tabIndex={-1} ref={panel}>
        <div className="ui-drawer__head"><h2>{title}</h2><button type="button" className="ui-icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div className="ui-drawer__body">{children}</div>
        {footer && <div className="ui-drawer__foot">{footer}</div>}
      </div>
    </div>
  );
}
