import type { FieldContract, SelectContract } from "@meguiars/ui-tokens";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

/** Etiqueta visible + ayuda + error enlazados por aria-describedby. */
function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FieldContract & { id: string; children: React.ReactNode }) {
  return (
    <div className="mg-field">
      <label htmlFor={id} className="mg-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className="mg-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="mg-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

type InputProps = FieldContract & Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & { name: string };

export function Input({ label, hint, error, required, name, ...rest }: InputProps) {
  const id = `field-${name}`;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        {...rest}
        id={id}
        name={name}
        required={required}
        className="mg-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </FieldShell>
  );
}

type SelectProps = SelectContract &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "value"> & { name: string; defaultValue?: string };

export function Select({
  label,
  hint,
  error,
  required,
  name,
  options,
  placeholder,
  value,
  ...rest
}: SelectProps) {
  const id = `field-${name}`;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        {...rest}
        id={id}
        name={name}
        value={value}
        required={required}
        className="mg-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
