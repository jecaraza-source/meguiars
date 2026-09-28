import {
  fail,
  type AppRole,
  type DashboardDefinition,
  type DashboardFactsRow,
  type DashboardPreferences,
  type DashboardRange,
  type DashboardRepository,
  type DashboardWidget,
  type DashboardWidgetType,
  type MetricRegistryEntry,
  type Result,
  type SavedDashboardFilters,
  type WidgetBreakdown,
  type WidgetOptionsValue,
} from "@meguiars/domain";
import {
  archiveDashboardSchema,
  dashboardFactsSchema,
  dashboardPreferencesSchema,
  dashboardSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Json, Tables } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type DefinitionRow = Tables<"dashboard_definitions"> & { dashboard_widgets?: Tables<"dashboard_widgets">[] };

const toWidget = (r: Tables<"dashboard_widgets">): DashboardWidget => ({
  id: r.id,
  metricId: r.metric_id,
  type: r.widget_type as DashboardWidgetType,
  title: r.title,
  position: r.position,
  colSpan: r.col_span,
  rowSpan: r.row_span,
  options: (r.options ?? {}) as WidgetOptionsValue,
});

const toDefinition = (r: DefinitionRow): DashboardDefinition => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  description: r.description,
  audienceRole: r.audience_role as AppRole | null,
  centerIds: r.center_ids,
  defaultRange: r.default_range as DashboardRange,
  isDefault: r.is_default,
  version: r.version,
  archivedAt: r.archived_at,
  widgets: (r.dashboard_widgets ?? []).map(toWidget).sort((a, b) => a.position - b.position),
});

const toPreferences = (r: Tables<"user_dashboard_preferences">): DashboardPreferences => ({
  dashboardId: r.dashboard_id,
  widgetOrder: r.widget_order,
  hiddenWidgetIds: r.hidden_widget_ids,
  filters: (r.filters ?? {}) as SavedDashboardFilters,
  isFavorite: r.is_favorite,
});

const toMetric = (r: Tables<"metric_registry">): MetricRegistryEntry => ({
  id: r.id,
  version: r.version,
  name: r.name,
  description: r.description,
  unit: r.unit,
  formula: r.formula,
  source: r.source,
  sourceTables: r.source_tables,
  capability: r.capability,
  widgetTypes: r.widget_types as DashboardWidgetType[],
  filters: r.filters,
  breakdowns: r.breakdowns as WidgetBreakdown[],
  drill: r.drill,
});

type J = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/** jsonb de public.dashboard_facts → hechos tipados (mismo contrato que @meguiars/analytics). */
export function toDashboardFacts(raw: J): DashboardFactsRow {
  const list = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as J[]) : undefined);
  const out: DashboardFactsRow = {
    from: String(raw.from),
    to: String(raw.to),
    grain: raw.grain as DashboardFactsRow["grain"],
  };
  const pnl = list("pnl");
  if (pnl)
    out.pnl = pnl.map((r) => ({
      detailCenterId: String(r.detail_center_id),
      bucket: String(r.bucket),
      section: r.section as "ingreso",
      line: String(r.line),
      dimension: (r.dimension as string | null) ?? null,
      amount: num(r.amount),
      movements: num(r.movements),
    }));
  const payments = list("payments");
  if (payments)
    out.payments = payments.map((r) => ({
      detailCenterId: String(r.detail_center_id),
      bucket: String(r.bucket),
      day: String(r.bucket),
      method: String(r.method),
      methodName: String(r.method_name),
      collectsCash: Boolean(r.collects_cash),
      validAmount: num(r.valid_amount),
      validCount: num(r.valid_count),
      reversedAmount: num(r.reversed_amount),
      reversedCount: num(r.reversed_count),
      changeAmount: num(r.change_amount),
    }));
  const pipeline = list("pipeline");
  if (pipeline)
    out.pipeline = pipeline.map((r) => ({
      opportunityId: String(r.opportunity_id),
      detailCenterId: String(r.detail_center_id),
      kind: r.kind as "b2b",
      createdOn: String(r.created_on),
      createdValue: num(r.created_value),
      outcome: (r.outcome as "ganada" | "perdida" | null) ?? null,
      closedOn: (r.closed_on as string | null) ?? null,
      wonValue: r.won_value === null || r.won_value === undefined ? null : num(r.won_value),
      currentValue: num(r.current_value),
      currentStageId: (r.current_stage_id as string | null) ?? null,
      stagesReached: (r.stages_reached as string[] | null) ?? [],
      cycleDays: r.cycle_days === null || r.cycle_days === undefined ? null : num(r.cycle_days),
    }));
  const stages = list("pipeline_stages");
  if (stages)
    out.pipelineStages = stages.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: r.kind as "abierta",
      position: num(r.position),
      probability: num(r.probability),
    }));
  const memberships = list("memberships");
  if (memberships)
    out.memberships = memberships.map((r) => ({
      detailCenterId: String(r.detail_center_id),
      status: r.status as "activa",
      price: num(r.price),
      periodMonths: num(r.period_months),
      entitledUnits: num(r.entitled_units),
      usedUnits: num(r.used_units),
      newInRange: Boolean(r.new_in_range),
      renewalsInRange: num(r.renewals_in_range),
      cancelledInRange: Boolean(r.cancelled_in_range),
      expiredInRange: Boolean(r.expired_in_range),
      revenueInRange: num(r.revenue_in_range),
    }));
  return out;
}

async function runVoid(call: () => PromiseLike<{ error: unknown }>): Promise<Result<void>> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

const WITH_WIDGETS = "*, dashboard_widgets(*)";

/** Adaptador de tableros: lectura por RLS, escritura y hechos por RPC. */
export function createDashboardRepository(client: MeguiarsSupabaseClient): DashboardRepository {
  const repo: DashboardRepository = {
    list() {
      return run(
        () =>
          client
            .from("dashboard_definitions")
            .select(WITH_WIDGETS)
            .is("archived_at", null)
            .order("is_default", { ascending: false })
            .order("name"),
        (rows) => (rows as DefinitionRow[]).map(toDefinition),
      );
    },

    get(id) {
      return run(
        () => client.from("dashboard_definitions").select(WITH_WIDGETS).eq("id", id).maybeSingle(),
        (row) => toDefinition(row as DefinitionRow),
      );
    },

    metrics() {
      return run(
        () => client.from("metric_registry").select("*").eq("active", true).order("id"),
        (rows) => rows.map(toMetric),
      );
    },

    preferences() {
      return run(
        () => client.from("user_dashboard_preferences").select("*"),
        (rows) => rows.map(toPreferences),
      );
    },

    async save(input) {
      const parsed = dashboardSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const v = parsed.data;
      const saved = await run(
        () =>
          client.rpc("save_dashboard", {
            p_organization_id: v.organizationId,
            p_id: v.id ?? null,
            p_request_id: v.requestId ?? null,
            p_version: v.version ?? null,
            p_name: v.name,
            p_description: v.description ?? null,
            p_audience_role: v.audienceRole,
            p_center_ids: v.centerIds,
            p_default_range: v.defaultRange,
            p_is_default: v.isDefault,
            p_widgets: v.widgets.map((w) => ({
              ...(w.id ? { id: w.id } : {}),
              metric_id: w.metricId,
              widget_type: w.type,
              title: w.title ?? null,
              col_span: w.colSpan,
              row_span: w.rowSpan,
              options: w.options,
            })) as Json,
            p_reason: v.reason ?? null,
          }),
        (row) => row.id,
      );
      return saved.ok ? repo.get(saved.data) : saved;
    },

    archive(id, version, reason) {
      const parsed = archiveDashboardSchema.safeParse({ id, version, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return runVoid(() =>
        client.rpc("archive_dashboard", { p_id: id, p_version: version, p_reason: parsed.data.reason }),
      );
    },

    savePreferences(prefs) {
      const parsed = dashboardPreferencesSchema.safeParse(prefs);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const p = parsed.data;
      return run(
        () =>
          client.rpc("save_dashboard_preferences", {
            p_dashboard_id: p.dashboardId,
            p_widget_order: p.widgetOrder,
            p_hidden_widget_ids: p.hiddenWidgetIds,
            p_filters: p.filters as Json,
            p_is_favorite: p.isFavorite,
          }),
        toPreferences,
      );
    },

    resetPreferences(dashboardId) {
      return runVoid(() => client.rpc("reset_dashboard_preferences", { p_dashboard_id: dashboardId }));
    },

    facts(query) {
      const parsed = dashboardFactsSchema.safeParse(query);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const q = parsed.data;
      if (q.sources.length === 0) return Promise.resolve(fail("validation", "Sin fuentes"));
      return run(
        () =>
          client.rpc("dashboard_facts", {
            p_sources: q.sources,
            p_detail_center_ids: q.detailCenterIds,
            p_from: q.from,
            p_to: q.to,
            p_grain: q.grain,
          }),
        (raw) => toDashboardFacts(raw as J),
      );
    },
  };
  return repo;
}
