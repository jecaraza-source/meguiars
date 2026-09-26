import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import { RULE_STAGE_LABELS, RULE_STATE_LABELS, RULE_STATE_TONES, upsellCopy } from "./copy";
import { ruleState, type UpsellRule, type UpsellSuggestion } from "./upsell";

export function presentSuggestion(s: UpsellSuggestion) {
  return {
    id: s.offerId,
    ruleId: s.ruleId,
    title: `${s.targetName} · ${formatMoney(s.price)}`,
    pitch: s.pitch,
    why: [
      s.sourceServiceName ? `${upsellCopy.because} ${s.sourceServiceName}` : null,
      s.offeredCount > 0 ? `${Math.round(s.acceptanceRate * 100)} % ${upsellCopy.acceptance}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    isMembership: s.targetKind === "membresia",
  };
}

export function presentRule(r: UpsellRule, today: string) {
  const state = ruleState(r, today);
  return {
    id: r.id,
    name: r.name,
    flow: `${r.sourceServiceName ?? upsellCopy.anySource} → ${r.targetName}`,
    stage: RULE_STAGE_LABELS[r.stage],
    priority: String(r.priority),
    state: RULE_STATE_LABELS[state],
    stateTone: RULE_STATE_TONES[state],
    validity: `${formatDateOnly(r.startsOn)}${r.endsOn ? ` – ${formatDateOnly(r.endsOn)}` : " en adelante"}`,
  };
}

/** Mensaje visible de un error del módulo. */
export function upsellErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001") return "La OS cambió en otro dispositivo; recarga para ver la versión actual";
  if (error.kind === "permission_denied" && !error.message) return upsellCopy.forbidden;
  return error.message;
}
