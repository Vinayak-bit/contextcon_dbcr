// Form controls: Input, TextField, TextArea, Select, CheckboxGroup, RadioGroup, Toggle, SelectCard.
// Inputs: 6 px radius, line-2 border, focus = accent border + 4 px accent ring at 16%.
import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from './primitives';

/** Bare text input with the system styling (use TextField when it needs a label). */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('ui-input', className)} {...rest} />;
}

interface FieldBits { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean }

/** Labelled text input with hint/error text wired to aria-describedby. */
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

/** Labelled multi-line input. */
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

/** Labelled native select. */
export function Select({ label, hint, error, required, value, onChange, options, placeholder, className }: FieldBits & { value: string; onChange(v: string): void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label htmlFor={id} className="ui-label">{label}{required && <span className="ui-req" aria-hidden> *</span>}</label>
      <select id={id} className="ui-input ui-select" value={value} required={required} aria-describedby={hint || error ? `${id}-d` : undefined} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {(hint || error) && <p id={`${id}-d`} className={error ? 'ui-error' : 'ui-hint'} role={error ? 'alert' : undefined}>{error || hint}</p>}
    </div>
  );
}

/** Option for CheckboxGroup / RadioGroup. */
export interface Option { id: string; label: ReactNode; description?: ReactNode; disabled?: boolean }

/** Checkbox list with optional "Select all · Clear". */
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

/** Radio list (native radios: arrow keys work). */
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

/** Switch-style boolean with a description. */
export function Toggle({ label, description, checked, onChange, disabled }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className={cx('ui-toggle', disabled && 'is-disabled')}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-toggle__track" aria-hidden><span className="ui-toggle__thumb" /></span>
      <span className="ui-toggle__text"><span>{label}</span>{description && <small>{description}</small>}</span>
    </label>
  );
}

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
