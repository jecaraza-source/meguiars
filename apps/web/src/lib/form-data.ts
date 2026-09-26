/** Utilidades de formularios con server actions (compartidas por los módulos). */

export interface ActionFormState {
  error?: string;
  fields?: Record<string, string>;
  message?: string;
  /** Valores enviados, para volver a pintar el formulario tras un error. */
  values?: Record<string, string | string[]>;
  /**
   * Marca de cada respuesta. React 19 reinicia el formulario tras la acción;
   * los formularios usan esta marca como `key` para volver a montarse con los
   * valores enviados (los <select> no recuperan su defaultValue con el reinicio).
   */
  at?: number;
}

export const stamp = <T extends ActionFormState>(state: T): T => ({ ...state, at: Date.now() });

export const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Valores enviados; las claves de `multi` conservan todos sus valores (casillas). */
export function values(form: FormData, multi: readonly string[] = []): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$")) continue;
    const all = form.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = multi.includes(key) ? all : (all[0] ?? "");
  }
  return out;
}

/**
 * Errores de validación para pintar el formulario. Los de campos ocultos
 * (ids que pone el servidor) no tienen dónde mostrarse: se reportan como error general.
 */
export function validationState(
  fields: Record<string, string>,
  hidden: readonly string[],
  form: FormData,
): ActionFormState {
  const hiddenError = hidden.map((k) => fields[k]).find(Boolean);
  return hiddenError
    ? { error: `Datos inválidos: ${hiddenError}`, values: values(form) }
    : { fields, values: values(form) };
}
