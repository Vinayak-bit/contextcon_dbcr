// Core primitives: Button, Card/SpotlightCard, Chip, Tag, IllustrativeTag, Note, Spinner,
// EmptyState and PageHeader. Styles live in web/src/styles/components.css (`ui-*` classes).
import { forwardRef, useRef } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { useMagnetic, useSpotlight } from '../../hooks';
import { Icon } from './icons';

export const cx = (...c: unknown[]) => c.filter((x): x is string => typeof x === 'string' && x.length > 0).join(' ');

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => refs.forEach((r) => {
    if (typeof r === 'function') r(node);
    else if (r) (r as { current: T | null }).current = node;
  });
}

/* ------------------------------------------------------------- Button --- */
interface ButtonLook {
  /** primary = accent-strong (exactly one per view); secondary = surface + border; ghost = text; danger = destructive. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** md/lg = 46 px tall, sm = 36 px. */
  size?: 'sm' | 'md' | 'lg';
  /** Trailing chevron that nudges on hover. Default: on for primary md/lg. */
  chevron?: boolean;
  /** Drift toward the cursor (hero CTA only). */
  magnetic?: boolean;
}
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonLook { loading?: boolean }

const btnClass = ({ variant = 'primary', size = 'md' }: ButtonLook, extra?: string) => cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, extra);
const showChev = ({ variant = 'primary', size = 'md', chevron }: ButtonLook) => chevron ?? (variant === 'primary' && size !== 'sm');

/** Button. Says exactly what happens ("Find your experts", "Save changes"). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', chevron, magnetic = false, loading = false, className, children, disabled, type = 'button', ...rest }, ref) {
  const own = useRef<HTMLButtonElement>(null);
  useMagnetic(magnetic ? own : { current: null });
  return (
    <button ref={mergeRefs(ref, own)} type={type} className={btnClass({ variant, size }, cx(loading && 'is-loading', magnetic && 'is-magnetic', className))}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="ui-spinner ui-spinner--inline" aria-hidden />}
      <span className="ui-btn__label">{children}</span>
      {!loading && showChev({ variant, size, chevron }) && <Icon name="chev" className="ui-btn__chev" />}
    </button>
  );
});

/** A link styled as a button (navigation, e.g. landing CTAs). */
export const ButtonLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & ButtonLook>(function ButtonLink(
  { variant = 'primary', size = 'md', chevron, magnetic = false, className, children, ...rest }, ref) {
  const own = useRef<HTMLAnchorElement>(null);
  useMagnetic(magnetic ? own : { current: null });
  return (
    <a ref={mergeRefs(ref, own)} className={btnClass({ variant, size }, cx(magnetic && 'is-magnetic', className))} {...rest}>
      <span className="ui-btn__label">{children}</span>
      {showChev({ variant, size, chevron }) && <Icon name="chev" className="ui-btn__chev" />}
    </a>
  );
});

/* --------------------------------------------------------------- Card --- */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  /** Hover lift (translateY(-3px) + sh-2). Only for cards that are themselves interactive. */
  interactive?: boolean;
  /** Cursor-following highlight and gradient border. */
  spotlight?: boolean;
}

/** Surface card: 1px line border, 6px radius, sh-1. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, padded = true, interactive = false, spotlight = false, children, ...rest }, ref) {
  const own = useRef<HTMLDivElement>(null);
  useSpotlight(own, spotlight);
  return (
    <div ref={mergeRefs(ref, own)} className={cx('ui-card', padded && 'ui-card--padded', interactive && 'is-interactive', spotlight && 'ui-spot', className)} {...rest}>
      {children}
    </div>
  );
});

/** Card with the spotlight effect on (radial highlight + gradient border following the cursor; tap glow on touch). */
export const SpotlightCard = forwardRef<HTMLDivElement, CardProps>(function SpotlightCard(props, ref) {
  return <Card ref={ref} spotlight {...props} />;
});

/* --------------------------------------------------------- PageHeader --- */
/** Page title block: optional sentence-case kicker, title, supporting line and actions. */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__text">
        {eyebrow && <p className="kicker">{eyebrow}</p>}
        <h1 className="ui-page-title">{title}</h1>
        {subtitle && <p className="ui-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------- Chip / Tag --- */
/** Small chip (4–6 px radius). `tone="topic"` gives the accent tint used for topic chips. */
export function Chip({ label, selected, onClick, onRemove, title, tone = 'neutral' }: { label: ReactNode; selected?: boolean; onClick?(): void; onRemove?(): void; title?: string; tone?: 'neutral' | 'topic' }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} title={title} className={cx('ui-chip', tone === 'topic' && 'ui-chip--topic', selected && 'is-selected', onClick && 'is-clickable')} onClick={onClick} aria-pressed={onClick ? Boolean(selected) : undefined}>
      {label}
      {onRemove && <span role="button" tabIndex={0} aria-label="Remove" className="ui-chip__x" onClick={(e) => { e.stopPropagation(); onRemove(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemove(); } }}>×</span>}
    </Tag>
  );
}

export type TagTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'sample' | 'accent';
/** Status tag (6 px radius, never pill). `icon` adds a leading line icon. */
export function Tag({ tone = 'neutral', children, title, icon }: { tone?: TagTone; children: ReactNode; title?: string; icon?: 'pin' | 'check' | 'warn' | 'info' }) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`)} title={title}>{icon && <Icon name={icon} />}{children}</span>;
}
/** Alias kept for existing code. */
export const Badge = Tag;

/** Dashed mono "Illustrative" tag. Required on every sample person, organization, number or result. */
export function IllustrativeTag({ children = 'Illustrative' }: { children?: ReactNode }) {
  return <span className="ui-tag-ill">{children}</span>;
}

/* --------------------------------------------------------------- Note --- */
export type NoteTone = 'info' | 'success' | 'warning' | 'danger' | 'sample';
const NOTE_ICON: Record<NoteTone, 'info' | 'check' | 'warn'> = { info: 'info', success: 'check', warning: 'warn', danger: 'warn', sample: 'info' };

/** Status note: bg-2 + line border + info icon; warnings use warn/warn-bg. Explains what happened and what to do. */
export function Note({ tone = 'info', title, children, action, onDismiss }: { tone?: NoteTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; onDismiss?(): void }) {
  return (
    <div className={cx('ui-notice', `ui-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={NOTE_ICON[tone]} className="ui-notice__icon" />
      <div className="ui-notice__body">
        {title && <strong className="ui-notice__title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="ui-notice__action">{action}</div>}
      {onDismiss && <button type="button" className="ui-notice__close" aria-label="Dismiss" onClick={onDismiss}><Icon name="close" /></button>}
    </div>
  );
}
/** Alias kept for existing code. */
export const Notice = Note;

/* ------------------------------------------------------------ Spinner --- */
/** Loading indicator; always pair with a visible or screen-reader label. */
export function Spinner({ label, size = 'md' }: { label?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="ui-spinner-wrap" role="status">
      <span className={cx('ui-spinner', `ui-spinner--${size}`)} aria-hidden />
      {label ? <span>{label}</span> : <span className="visually-hidden">Loading</span>}
    </span>
  );
}

/* --------------------------------------------------------- EmptyState --- */
/** Empty state: says what happened and invites the next action. */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <h3>{title}</h3>
      {children && <div className="ui-empty__body">{children}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}
