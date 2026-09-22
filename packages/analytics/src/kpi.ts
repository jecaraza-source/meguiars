/**
 * Regla: toda fórmula de KPI tiene definición única, fuente de datos y
 * pruebas. Cada KPI se declara con `defineKpi` y se registra en
 * `kpiRegistry`; el id no puede repetirse.
 */
export type KpiUnit = "count" | "percent" | "currency" | "minutes" | "hours" | "ratio";

/** Nivel de agregación: por centro o consolidado corporativo. */
export type KpiScope = "center" | "corporate";

export interface KpiDefinition<TInput, TResult = number> {
  /** Identificador estable con namespace, p. ej. "service_order.avg_cycle_time". */
  id: string;
  name: string;
  /** Fórmula en lenguaje de negocio. */
  formula: string;
  /** Tablas/vistas de origen, p. ej. ["public.service_orders"]. */
  sources: readonly string[];
  unit: KpiUnit;
  scopes: readonly KpiScope[];
  compute: (input: TInput) => TResult;
}

const KPI_ID = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export function defineKpi<TInput, TResult = number>(
  definition: KpiDefinition<TInput, TResult>,
): KpiDefinition<TInput, TResult> {
  if (!KPI_ID.test(definition.id)) {
    throw new Error(`Id de KPI inválido: ${definition.id}`);
  }
  if (definition.sources.length === 0) {
    throw new Error(`El KPI ${definition.id} debe declarar su fuente de datos`);
  }
  if (definition.scopes.length === 0) {
    throw new Error(`El KPI ${definition.id} debe declarar al menos un nivel de agregación`);
  }
  return definition;
}

// El registro guarda KPIs heterogéneos; el tipo concreto lo conserva `register`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyKpi = KpiDefinition<any, any>;

export class KpiRegistry {
  private readonly byId = new Map<string, AnyKpi>();

  register<TInput, TResult>(definition: KpiDefinition<TInput, TResult>): KpiDefinition<TInput, TResult> {
    if (this.byId.has(definition.id)) {
      throw new Error(`KPI duplicado: ${definition.id}`);
    }
    this.byId.set(definition.id, definition);
    return definition;
  }

  get(id: string): AnyKpi | undefined {
    return this.byId.get(id);
  }

  list(): AnyKpi[] {
    return [...this.byId.values()];
  }
}

/** Registro único de KPIs de la plataforma. */
export const kpiRegistry = new KpiRegistry();
