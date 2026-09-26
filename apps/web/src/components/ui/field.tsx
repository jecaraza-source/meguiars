import type { CheckboxContract, FieldContract, SelectContract } from "@meguiars/ui-tokens";
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

type InputProps = FieldContract &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
    name: string;
    /** Id propio cuando dos formularios de la página usan el mismo `name`. */
    id?: string;
  };

export function Input({ label, hint, error, required, name, id: ownId, ...rest }: InputProps) {
  const id = ownId ?? `field-${name}`;
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
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "value"> & {
    name: string;
    defaultValue?: string;
    /** Id propio cuando dos formularios de la página usan el mismo `name`. */
    id?: string;
  };

export function Select({
  label,
  hint,
  error,
  required,
  name,
  options,
  placeholder,
  value,
  id: ownId,
  ...rest
}: SelectProps) {
  const id = ownId ?? `field-${name}`;
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

type CheckboxProps = CheckboxContract &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "checked"> & {
    name: string;
    value: string;
    /** Id propio cuando dos formularios de la página usan el mismo `name`. */
    id?: string;
  };

/** Casilla con etiqueta clicable y área táctil completa. */
export function Checkbox({ label, hint, checked, name, value, id: ownId, ...rest }: CheckboxProps) {
  const id = ownId ?? `field-${name}-${value}`;
  return (
    <label htmlFor={id} className="flex min-h-(--mg-touch-target) cursor-pointer items-center gap-sm">
      <input
        {...rest}
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-lg accent-brand"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <span className="text-sm">{label}</span>
      {hint ? (
        <span id={`${id}-hint`} className="mg-hint">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
