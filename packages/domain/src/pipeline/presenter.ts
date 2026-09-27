import { BILLING_MODEL_LABELS, VEHICLE_RULE_LABELS } from "../b2b/copy";
import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import {
  LOSS_REASON_LABELS,
  NEXT_ACTION_LABELS,
  NEXT_ACTION_TONES,
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_KIND_LABELS,
  OPPORTUNITY_SOURCE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_TONES,
  OPPORTUNITY_TASK_KIND_LABELS,
  pipelineCopy,
} from "./copy";
import {
  nextActionState,
  opportunityAgeDays,
  weightedValue,
  type Opportunity,
  type OpportunityEvent,
  type OpportunityTask,
  type PipelineStage,
} from "./pipeline";

/** Tarjeta del tablero (web y móvil). */
export function presentOpportunityCard(o: Opportunity) {
  const next = nextActionState(o, o.today);
  return {
    id: o.id,
    title: o.title,
    company: o.displayName,
    kind: OPPORTUNITY_KIND_LABELS[o.kind],
    value: formatMoney(o.estimatedValue),
    weighted: formatMoney(weightedValue(o.estimatedValue, o.stageProbability)),
    owner: o.ownerName ?? pipelineCopy.unassigned,
    nextAction:
      next === null
        ? null
        : next === "sin_accion"
          ? NEXT_ACTION_LABELS.sin_accion
          : `${o.nextAction}${o.nextActionOn ? ` · ${formatDateOnly(o.nextActionOn)}` : ""}`,
    nextActionState: next,
    nextActionTone: next ? NEXT_ACTION_TONES[next] : "neutral",
    nextActionLabel: next ? NEXT_ACTION_LABELS[next] : null,
    ageDays: opportunityAgeDays(o.createdAt, o.today),
    openTasks: o.openTasks,
    status: OPPORTUNITY_STATUS_LABELS[o.status],
    statusTone: OPPORTUNITY_STATUS_TONES[o.status],
  };
}

/** Columnas del tablero: etapas abiertas activas (y las que aún tengan oportunidades). */
export function boardColumns(stages: readonly PipelineStage[], opportunities: readonly Opportunity[]) {
  const open = opportunities.filter((o) => o.status === "abierta");
  return stages
    .filter((s) => s.kind === "abierta" && (s.active || open.some((o) => o.stageId === s.id)))
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const items = open.filter((o) => o.stageId === s.id);
      const total = items.reduce((t, o) => t + o.estimatedValue, 0);
      return {
        id: s.id,
        name: s.name,
        probability: s.probability,
        count: items.length,
        total: formatMoney(total),
        weighted: formatMoney(weightedValue(total, s.probability)),
        items,
      };
    });
}

/** Ficha de la oportunidad. */
export function presentOpportunity(o: Opportunity) {
  const p = o.proposal;
  return {
    ...presentOpportunityCard(o),
    center: o.centerName,
    stage: o.stageName,
    probability: `${o.stageProbability} %`,
    source: o.source ? OPPORTUNITY_SOURCE_LABELS[o.source] : "—",
    expectedClose: o.expectedCloseOn ? formatDateOnly(o.expectedCloseOn) : "—",
    contact: [o.prospect.contactName, o.prospect.contactTitle].filter(Boolean).join(" · ") || "—",
    phone: o.prospect.contactPhone ?? "—",
    email: o.prospect.contactEmail ?? "—",
    fiscal: [o.prospect.legalName, o.prospect.rfc].filter(Boolean).join(" · ") || "—",
    linked: o.b2bAccountId ? "Cuenta B2B" : o.clientId ? "Cliente registrado" : "Prospecto",
    proposal: p.billingModel
      ? [
          BILLING_MODEL_LABELS[p.billingModel],
          `${p.months ?? 12} meses`,
          p.feeAmount != null
            ? `cuota ${formatMoney(p.feeAmount)} · ${p.includedUnits ?? 0} incluidos`
            : null,
          p.vehicleRule ? VEHICLE_RULE_LABELS[p.vehicleRule] : null,
          p.paymentTermsDays != null ? `${p.paymentTermsDays} días de crédito` : null,
          p.creditLimit != null ? `límite ${formatMoney(p.creditLimit)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "—",
    closed:
      o.status === "ganada"
        ? `Ganada el ${formatDateOnly(o.closedAt?.slice(0, 10))} por ${formatMoney(o.wonValue ?? 0)}`
        : o.status === "perdida"
          ? `Perdida el ${formatDateOnly(o.closedAt?.slice(0, 10))}: ${
              o.lossReason ? LOSS_REASON_LABELS[o.lossReason] : ""
            }${o.lossNotes ? ` · ${o.lossNotes}` : ""}`
          : null,
  };
}

/** Línea del historial. */
export function presentOpportunityEvent(e: OpportunityEvent) {
  const detail =
    e.kind === "etapa" || e.kind === "reabierta"
      ? `${e.fromStageName ?? "—"} → ${e.toStageName ?? "—"}`
      : e.kind === "creada"
        ? `En ${e.toStageName ?? "—"} · ${formatMoney(e.value ?? 0)}`
        : e.kind === "valor" || e.kind === "ganada"
          ? formatMoney(e.value ?? 0)
          : e.kind === "responsable"
            ? (e.ownerName ?? pipelineCopy.unassigned)
            : null;
  return {
    id: e.id,
    what: OPPORTUNITY_EVENT_LABELS[e.kind],
    detail,
    note: e.note,
    who: e.actorName ?? "Sistema",
    when: new Date(e.occurredAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }),
  };
}

export function presentOpportunityTask(t: OpportunityTask, today: string) {
  return {
    id: t.id,
    what: OPPORTUNITY_TASK_KIND_LABELS[t.kind],
    due: formatDateOnly(t.dueOn),
    overdue: t.status === "pendiente" && t.dueOn < today,
    notes: t.notes,
    done: t.status !== "pendiente",
    status: t.status === "hecha" ? "Hecha" : t.status === "cancelada" ? "Cancelada" : "Pendiente",
  };
}

/** Mensaje visible de un error del módulo. */
export function pipelineErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001")
    return "La oportunidad cambió en otro dispositivo; recarga para ver la versión actual";
  if (error.kind === "permission_denied" && !error.message) return pipelineCopy.forbidden;
  return error.message;
}
