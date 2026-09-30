import "server-only";
import { COMMERCIAL_KPIS, funnelBreakdown, lossReasons, type FunnelBreakdownRow } from "@meguiars/analytics";
import {
  canInCenter,
  commercialErrorMessage,
  formatCommercialKpi,
  LEAD_LOSS_REASON_LABELS,
  LEAD_SOURCE_LABELS,
  pilotPeriod,
  presentLead,
  usableCenters,
  type Capability,
  type CommercialRepository,
  type LeadFilter,
  type LeadLossReason,
  type LeadSource,
  type SignedInState,
} from "@meguiars/domain";

/** Centros de la organización donde la persona tiene la capacidad. */
export function commercialCenters(state: SignedInState, capability: Capability) {
  return usableCenters(state.access)
    .filter((a) => canInCenter(state, a.center.id, capability))
    .map((a) => a.center);
}

/** Prospectos por etapa (tablero), con alertas de contacto y siguiente acción. */
export async function loadLeadsBoard(
  repo: CommercialRepository,
  organizationId: string,
  centerIds: string[],
  filter: LeadFilter,
) {
  const [leads, stages] = await Promise.all([repo.leads(centerIds, filter), repo.stages(organizationId)]);
  if (!leads.ok)
    return { error: commercialErrorMessage(leads.error), columns: [], leads: [], counters: null };
  const rows = leads.data.map(presentLead);
  const stageList = stages.ok
    ? stages.data.filter((s) => s.active || rows.some((r) => r.stageId === s.id))
    : [];
  return {
    error: null,
    leads: rows,
    columns: stageList.map((s) => ({ stage: s, leads: rows.filter((r) => r.stageId === s.id) })),
    counters: {
      open: rows.filter((r) => r.status === "abierta").length,
      uncontacted: rows.filter((r) => r.uncontacted).length,
      overdue: rows.filter((r) => r.nextActionTone === "danger").length,
    },
  };
}

const breakdownRows = (rows: FunnelBreakdownRow[], label: (key: string) => string) =>
  rows.map((r) => ({
    ...r,
    label: label(r.key),
    leadToBookingLabel: formatCommercialKpi("percent", r.leadToBooking),
    salesLabel: formatCommercialKpi("currency", r.sales),
    marginLabel: formatCommercialKpi("currency", r.margin),
    responseLabel: formatCommercialKpi("minutes", r.medianFirstResponse),
  }));

/** Reportes comerciales del periodo: KPIs con fórmula, desgloses y motivos de pérdida. */
export async function loadCommercialReport(
  repo: CommercialRepository,
  centers: { id: string; name: string }[],
  periodId: string,
  today: string,
  ownerNames: Record<string, string> = {},
) {
  const period = pilotPeriod(periodId, today);
  const ids = centers.map((c) => c.id);
  const [facts, quotes] = await Promise.all([
    repo.funnelFacts(ids, period.from, period.to),
    repo.quoteFacts(ids, period.from, period.to),
  ]);
  if (!facts.ok)
    return {
      period,
      error: commercialErrorMessage(facts.error),
      kpis: [],
      bySource: [],
      byOwner: [],
      byCenter: [],
      losses: [],
    };
  const input = { facts: facts.data, quotes: quotes.ok ? quotes.data : [] };
  const centerName = Object.fromEntries(centers.map((c) => [c.id, c.name]));
  return {
    period,
    error: quotes.ok ? null : commercialErrorMessage(quotes.error),
    kpis: COMMERCIAL_KPIS.map((k) => {
      const value = k.compute(input) as number | null;
      return {
        id: k.id,
        name: k.name,
        formula: k.formula,
        unit: k.unit,
        value,
        display: formatCommercialKpi(k.unit, value),
      };
    }),
    bySource: breakdownRows(
      funnelBreakdown(facts.data, "source"),
      (k) => LEAD_SOURCE_LABELS[k as LeadSource] ?? k,
    ),
    byOwner: breakdownRows(funnelBreakdown(facts.data, "owner"), (k) =>
      k ? (ownerNames[k] ?? "Responsable") : "Sin asignar",
    ),
    byCenter: breakdownRows(funnelBreakdown(facts.data, "center"), (k) => centerName[k] ?? k),
    losses: lossReasons(facts.data).map((l) => ({
      ...l,
      label: LEAD_LOSS_REASON_LABELS[l.reason as LeadLossReason] ?? l.reason,
    })),
  };
}
