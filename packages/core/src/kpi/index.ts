/**
 * Regla: toda fórmula de KPI tiene definición única, fuente de datos
 * y pruebas. Cada KPI se declara con `defineKpi` y se registra en
 * `kpiRegistry`; el id no puede repetirse.
 */
export interface KpiDefinition<TInput, TResult = number> {
  /** Identificador estable, p. ej. "service_order.avg_cycle_time". */
  id: string;
  name: string;
  /** Fórmula en lenguaje de negocio. */
  formula: string;
  /** Tablas/vistas de origen, p. ej. ["public.service_orders"]. */
  sources: readonly string[];
  unit: "count" | "percent" | "currency" | "minutes" | "hours" | "ratio";
  compute: (input: TInput) => TResult;
}

export function defineKpi<TInput, TResult = number>(
  definition: KpiDefinition<TInput, TResult>,
): KpiDefinition<TInput, TResult> {
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(definition.id)) {
    throw new Error(`Id de KPI inválido: ${definition.id}`);
  }
  if (definition.sources.length === 0) {
    throw new Error(`El KPI ${definition.id} debe declarar su fuente de datos`);
  }
  return definition;
}

export class KpiRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly byId = new Map<string, KpiDefinition<any, any>>();

  register<TInput, TResult>(definition: KpiDefinition<TInput, TResult>): KpiDefinition<TInput, TResult> {
    if (this.byId.has(definition.id)) {
      throw new Error(`KPI duplicado: ${definition.id}`);
    }
    this.byId.set(definition.id, definition);
    return definition;
  }

  get(id: string) {
    return this.byId.get(id);
  }

  list() {
    return [...this.byId.values()];
  }
}

/** Registro único de KPIs de la plataforma. */
export const kpiRegistry = new KpiRegistry();
