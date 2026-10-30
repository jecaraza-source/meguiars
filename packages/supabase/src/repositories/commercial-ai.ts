import {
  type CommercialAiContent,
  type CommercialAiReport,
  type CommercialAiReportRepository,
  type CommercialAiStatus,
} from "@meguiars/domain";
import type { MeguiarsSupabaseClient } from "../client";
import type { Tables } from "../database.types";
import { run } from "./shared";

const toReport = (r: Tables<"commercial_ai_reports">): CommercialAiReport => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  periodLabel: r.period_label,
  periodFrom: r.period_from,
  periodTo: r.period_to,
  scopeLabel: r.scope_label,
  status: r.status as CommercialAiStatus,
  error: r.error,
  model: r.model,
  createdAt: r.created_at,
  summary: r.summary ?? "",
  highlights: r.highlights,
  risks: r.risks,
  actions: r.actions,
});

/** Reportes comerciales con IA (ADR 0051): leer y pedir con la sesión del usuario. */
export function createCommercialAiReportRepository(
  client: MeguiarsSupabaseClient,
): CommercialAiReportRepository {
  return {
    list(detailCenterId, limit = 10) {
      return run(
        () =>
          client
            .from("commercial_ai_reports")
            .select("*")
            .eq("detail_center_id", detailCenterId)
            .order("created_at", { ascending: false })
            .limit(limit),
        (rows) => rows.map(toReport),
      );
    },
    start(c) {
      return run(
        () =>
          client.rpc("start_commercial_ai_report", {
            p_detail_center_id: c.detailCenterId,
            p_center_ids: c.centerIds,
            p_from: c.from,
            p_to: c.to,
            p_period_label: c.periodLabel,
            p_scope_label: c.scopeLabel,
            p_request_id: c.requestId,
          }),
        (id) => ({ id }),
      );
    },
  };
}

/** Paso 2, sólo en el servidor con service_role: guarda el texto de la IA o el error. */
export function completeCommercialAiReport(
  service: MeguiarsSupabaseClient,
  id: string,
  content: CommercialAiContent,
  model: string,
) {
  return run(
    () =>
      service.rpc("complete_commercial_ai_report", {
        p_id: id,
        p_summary: content.summary,
        p_highlights: content.highlights,
        p_risks: content.risks,
        p_actions: content.actions,
        p_model: model,
      }),
    () => undefined,
  );
}

export function failCommercialAiReport(service: MeguiarsSupabaseClient, id: string, error: string) {
  return run(
    () => service.rpc("fail_commercial_ai_report", { p_id: id, p_error: error }),
    () => undefined,
  );
}
