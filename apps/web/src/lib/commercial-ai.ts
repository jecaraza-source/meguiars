import "server-only";
import {
  canInCenter,
  COMMERCIAL_AI_COPY,
  COMMERCIAL_AI_MODEL,
  commercialAiPrompt,
  fail,
  normalizeCommercialAiContent,
  todayIn,
  usableCenters,
  type CommercialReportSnapshot,
  type CommercialSnapshotRow,
  type Result,
  type SignedInState,
} from "@meguiars/domain";
import {
  completeCommercialAiReport,
  createCommercialAiReportRepository,
  createCommercialRepository,
  failCommercialAiReport,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { commercialAiRequestSchema } from "@meguiars/validation";
import { writeCommercialReport } from "@/lib/claude-llm";
import { commercialCenters, loadCommercialReport } from "@/lib/commercial";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type LoadedReport = Awaited<ReturnType<typeof loadCommercialReport>>;

const rows = (xs: LoadedReport["bySource"]): CommercialSnapshotRow[] =>
  xs.map((r) => ({
    label: r.label,
    leads: r.leads,
    quoted: r.quoted,
    booked: r.booked,
    won: r.won,
    leadToBooking: r.leadToBookingLabel,
    firstResponse: r.responseLabel,
    sales: r.salesLabel,
    margin: r.marginLabel,
  }));

/** Las mismas cifras que muestra la pantalla, ya formateadas (la IA no calcula). */
function snapshot(report: LoadedReport, centers: string[]): CommercialReportSnapshot {
  return {
    periodLabel: report.period.label,
    from: report.period.from,
    to: report.period.to,
    centers,
    kpis: report.kpis.map((k) => ({ name: k.name, formula: k.formula, value: k.display })),
    bySource: rows(report.bySource),
    byOwner: rows(report.byOwner),
    byCenter: rows(report.byCenter),
    losses: report.losses.map((l) => ({ label: l.label, count: l.count })),
  };
}

/**
 * Reporte comercial con IA (ADR 0051), para la web (server action) y la app
 * (POST /api/comercial/reporte-ia). Permisos y periodo con la sesión del
 * usuario; el texto de la IA lo guarda sólo el servidor.
 */
export async function generateCommercialAiReport(
  client: MeguiarsSupabaseClient,
  state: SignedInState,
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = commercialAiRequestSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", parsed.error.issues[0]?.message ?? "Datos inválidos");
  const input = parsed.data;
  const access = usableCenters(state.access).find((a) => a.center.id === input.detailCenterId);
  if (!access || !canInCenter(state, access.center.id, "commercial.metrics.read"))
    return fail("permission_denied", "No puedes ver los reportes comerciales de este centro.");
  const service = createSupabaseServiceClient();
  if (!service || !process.env.ANTHROPIC_API_KEY)
    return fail("unavailable", COMMERCIAL_AI_COPY.notConfigured);

  const all = commercialCenters(state, "commercial.metrics.read");
  const centers = input.scope === "todos" ? all : all.filter((c) => c.id === access.center.id);
  const today = todayIn(access.center.timezone);
  const repo = createCommercialRepository(client);
  const owners = await repo.leadOwners(access.center.id);
  const report = await loadCommercialReport(
    repo,
    centers,
    input.periodId,
    today,
    Object.fromEntries((owners.ok ? owners.data : []).map((o) => [o.userId, o.fullName])),
  );
  if (report.error && !report.kpis.length) return fail("unavailable", report.error);

  const started = await createCommercialAiReportRepository(client).start({
    detailCenterId: access.center.id,
    centerIds: centers.map((c) => c.id),
    from: report.period.from,
    to: report.period.to,
    periodLabel: report.period.label,
    scopeLabel: centers.map((c) => c.name).join(" · "),
    requestId: input.requestId,
  });
  if (!started.ok) return started;
  const id = started.data.id;
  // Doble envío con el mismo requestId: no se vuelve a pagar a la IA.
  const { data: existing } = await client
    .from("commercial_ai_reports")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (existing && existing.status !== "pendiente") return { ok: true, data: { id } };
  try {
    const out = await writeCommercialReport(
      commercialAiPrompt(
        snapshot(
          report,
          centers.map((c) => c.name),
        ),
      ),
      COMMERCIAL_AI_MODEL,
    );
    if (!out) {
      await failCommercialAiReport(service, id, "La IA no completó el reporte; intenta de nuevo.");
      return fail("unavailable", "La IA no completó el reporte; intenta de nuevo.");
    }
    const saved = await completeCommercialAiReport(
      service,
      id,
      normalizeCommercialAiContent(out.content),
      out.model,
    );
    return saved.ok ? { ok: true, data: { id } } : saved;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await failCommercialAiReport(service, id, message);
    return fail("unavailable", "No se pudo generar el reporte con IA; intenta de nuevo.");
  }
}
