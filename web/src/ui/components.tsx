// Shared UI kit — owned by Laptop 4. Feature code (Laptops 1–2) composes these.
// Need something new? Build it in your feature folder and request it in docs/CHANGE_REQUESTS.md.
import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const cx = (...c: unknown[]) => c.filter((x): x is string => typeof x === 'string' && x.length > 0).join(' ');

/* ------------------------------------------------------------- Button --- */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}
export function Button({ variant = 'primary', size = 'md', loading = false, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, loading && 'is-loading', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="ui-spinner ui-spinner--inline" aria-hidden />}
      <span>{children}</span>
    </button>
  );
}

/* --------------------------------------------------------------- Card --- */
export function Card({ className, padded = true, children, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cx('ui-card', padded && 'ui-card--padded', className)} {...rest}>{children}</div>;
}

/* --------------------------------------------------------- PageHeader --- */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="ui-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

/* --------------------------------------------------------- SelectCard --- */
/** Large selectable card (radio by default, checkbox when `multi`). */
export function SelectCard({ title, description, selected, onSelect, multi = false, icon, disabled }: { title: ReactNode; description?: ReactNode; selected: boolean; onSelect(): void; multi?: boolean; icon?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={selected} disabled={disabled} onClick={onSelect} className={cx('ui-select-card', selected && 'is-selected')}>
      {icon && <span className="ui-select-card__icon" aria-hidden>{icon}</span>}
      <span className="ui-select-card__title">{title}</span>
      {description && <span className="ui-select-card__desc">{description}</span>}
      <span className={cx('ui-select-card__mark', multi && 'is-multi')} aria-hidden />
    </button>
  );
}

/* ------------------------------------------------- Checkbox / Radio ---- */
export interface Option { id: string; label: ReactNode; description?: ReactNode; disabled?: boolean }

export function CheckboxGroup({ legend, options, value, onChange, columns = 2, selectAll = false, hint, error }: { legend: ReactNode; options: Option[]; value: string[]; onChange(ids: string[]): void; columns?: 1 | 2 | 3; selectAll?: boolean; hint?: ReactNode; error?: ReactNode }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const all = options.filter((o) => !o.disabled).map((o) => o.id);
  return (
    <fieldset className="ui-fieldset">
      <legend className="ui-legend">{legend}</legend>
      {hint && <p className="ui-hint">{hint}</p>}
      {selectAll && (
        <div className="ui-select-all">
          <button type="button" className="ui-link-btn" onClick={() => onChange(all)}>Select all</button>
          <span aria-hidden>·</span>
          <button type="button" className="ui-link-btn" onClick={() => onChange([])}>Clear</button>
        </div>
      )}
      <div className={cx('ui-choice-grid', `cols-${columns}`)}>
        {options.map((o) => (
          <label key={o.id} className={cx('ui-choice', value.includes(o.id) && 'is-checked', o.disabled && 'is-disabled')}>
            <input type="checkbox" checked={value.includes(o.id)} disabled={o.disabled} onChange={() => toggle(o.id)} />
            <span className="ui-choice__text"><span>{o.label}</span>{o.description && <small>{o.description}</small>}</span>
          </label>
        ))}
      </div>
      {error && <p className="ui-error" role="alert">{error}</p>}
    </fieldset>
  );
}

export function RadioGroup({ legend, name, options, value, onChange, columns = 2, hint, error }: { legend: ReactNode; name?: string; options: Option[]; value: string | null; onChange(id: string): void; columns?: 1 | 2 | 3; hint?: ReactNode; error?: ReactNode }) {
  const auto = useId();
  return (
    <fieldset className="ui-fieldset" role="radiogroup">
      <legend className="ui-legend">{legend}</legend>
      {hint && <p className="ui-hint">{hint}</p>}
      <div className={cx('ui-choice-grid', `cols-${columns}`)}>
        {options.map((o) => (
          <label key={o.id} className={cx('ui-choice', value === o.id && 'is-checked', o.disabled && 'is-disabled')}>
            <input type="radio" name={name || auto} checked={value === o.id} disabled={o.disabled} onChange={() => onChange(o.id)} />
            <span className="ui-choice__text"><span>{o.label}</span>{o.description && <small>{o.description}</small>}</span>
          </label>
        ))}
      </div>
      {error && <p className="ui-error" role="alert">{error}</p>}
    </fieldset>
  );
}

/** Switch-style boolean with a description (e.g. "include unverified candidates"). */
export function Toggle({ label, description, checked, onChange, disabled }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className={cx('ui-toggle', disabled && 'is-disabled')}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-toggle__track" aria-hidden><span className="ui-toggle__thumb" /></span>
      <span className="ui-toggle__text"><span>{label}</span>{description && <small>{description}</small>}</span>
    </label>
  );
}

/* --------------------------------------------------------- Text input --- */
interface FieldBits { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean }

export function TextField({ label, hint, error, required, value, onChange, className, ...rest }: FieldBits & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange(v: string): void }) {
  const id = useId();
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label htmlFor={id} className="ui-label">{label}{required && <span className="ui-req" aria-hidden> *</span>}</label>
      <input id={id} className="ui-input" value={value} required={required} aria-invalid={Boolean(error) || undefined} aria-describedby={hint || error ? `${id}-d` : undefined} onChange={(e) => onChange(e.target.value)} {...rest} />
      {(hint || error) && <p id={`${id}-d`} className={error ? 'ui-error' : 'ui-hint'} role={error ? 'alert' : undefined}>{error || hint}</p>}
    </div>
  );
}

export function TextArea({ label, hint, error, required, value, onChange, rows = 4, className, ...rest }: FieldBits & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange(v: string): void }) {
  const id = useId();
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label htmlFor={id} className="ui-label">{label}{required && <span className="ui-req" aria-hidden> *</span>}</label>
      <textarea id={id} className="ui-input ui-textarea" rows={rows} value={value} required={required} aria-invalid={Boolean(error) || undefined} aria-describedby={hint || error ? `${id}-d` : undefined} onChange={(e) => onChange(e.target.value)} {...rest} />
      {(hint || error) && <p id={`${id}-d`} className={error ? 'ui-error' : 'ui-hint'} role={error ? 'alert' : undefined}>{error || hint}</p>}
    </div>
  );
}

export function Select({ label, hint, error, required, value, onChange, options, placeholder, className }: FieldBits & { value: string; onChange(v: string): void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label htmlFor={id} className="ui-label">{label}{required && <span className="ui-req" aria-hidden> *</span>}</label>
      <select id={id} className="ui-input ui-select" value={value} required={required} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {(hint || error) && <p className={error ? 'ui-error' : 'ui-hint'} role={error ? 'alert' : undefined}>{error || hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------- Chip / Badge --- */
export function Chip({ label, selected, onClick, onRemove, title }: { label: ReactNode; selected?: boolean; onClick?(): void; onRemove?(): void; title?: string }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} title={title} className={cx('ui-chip', selected && 'is-selected', onClick && 'is-clickable')} onClick={onClick} aria-pressed={onClick ? Boolean(selected) : undefined}>
      {label}
      {onRemove && <span role="button" tabIndex={0} aria-label="Remove" className="ui-chip__x" onClick={(e) => { e.stopPropagation(); onRemove(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemove(); } }}>×</span>}
    </Tag>
  );
}

export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'sample' | 'accent'; children: ReactNode; title?: string }) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`)} title={title}>{children}</span>;
}

/* ------------------------------------------------------------- Notice --- */
export function Notice({ tone = 'info', title, children, action, onDismiss }: { tone?: 'info' | 'success' | 'warning' | 'danger' | 'sample'; title?: ReactNode; children?: ReactNode; action?: ReactNode; onDismiss?(): void }) {
  return (
    <div className={cx('ui-notice', `ui-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="ui-notice__body">
        {title && <strong className="ui-notice__title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="ui-notice__action">{action}</div>}
      {onDismiss && <button type="button" className="ui-notice__close" aria-label="Dismiss" onClick={onDismiss}>×</button>}
    </div>
  );
}

/* ------------------------------------------------------------ Spinner --- */
export function Spinner({ label, size = 'md' }: { label?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="ui-spinner-wrap" role="status">
      <span className={cx('ui-spinner', `ui-spinner--${size}`)} aria-hidden />
      {label ? <span>{label}</span> : <span className="visually-hidden">Loading</span>}
    </span>
  );
}

/* --------------------------------------------------------------- Tabs --- */
export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: ReactNode; count?: number }[]; value: K; onChange(k: K): void }) {
  return (
    <div className="ui-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === value} className={cx('ui-tab', t.key === value && 'is-active')} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <span className="ui-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Scores --- */
const scoreTone = (pct: number) => (pct >= 70 ? 'var(--score-high)' : pct >= 45 ? 'var(--score-mid)' : 'var(--score-low)');

/** Overall score 0–100. */
export function ScoreRing({ score, size = 56, label = 'Match score' }: { score: number; size?: number; label?: string }) {
  const r = (size - 6) / 2; const c = 2 * Math.PI * r; const pct = Math.max(0, Math.min(100, score));
  return (
    <span className="ui-score-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct)} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreTone(pct)} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ui-score-ring__value">{Math.round(pct)}</span>
    </span>
  );
}

/** One rubric criterion, value 0–5. */
export function ScoreBar({ label, value, weight, source }: { label: ReactNode; value: number; weight?: number; source?: string }) {
  const pct = (Math.max(0, Math.min(5, value)) / 5) * 100;
  return (
    <div className="ui-score-bar">
      <div className="ui-score-bar__head">
        <span className="ui-score-bar__label">{label}</span>
        <span className="ui-score-bar__meta">{value.toFixed(1)}/5{weight !== undefined && <> · {Math.round(weight)}%</>}{source && <> · {source}</>}</span>
      </div>
      <div className="ui-score-bar__track" aria-hidden><div className="ui-score-bar__fill" style={{ width: `${pct}%`, background: scoreTone(pct) }} /></div>
    </div>
  );
}

/* ------------------------------------------------------------- Drawer --- */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose(): void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
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
        <div className="ui-drawer__head"><h2>{title}</h2><button type="button" className="ui-icon-btn" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="ui-drawer__body">{children}</div>
        {footer && <div className="ui-drawer__foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Stepper --- */
export function Stepper<K extends string>({ steps, current, completed = [], onSelect }: { steps: { key: K; label: string }[]; current: K; completed?: K[]; onSelect?(k: K): void }) {
  return (
    <ol className="ui-stepper">
      {steps.map((s, i) => {
        const done = completed.includes(s.key); const active = s.key === current;
        const clickable = Boolean(onSelect) && (done || active);
        return (
          <li key={s.key} className={cx('ui-step', active && 'is-active', done && 'is-done')}>
            <button type="button" disabled={!clickable} onClick={() => onSelect?.(s.key)} aria-current={active ? 'step' : undefined}>
              <span className="ui-step__num">{done && !active ? '✓' : i + 1}</span>
              <span className="ui-step__label">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------- EmptyState --- */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}
