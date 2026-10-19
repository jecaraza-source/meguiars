import "server-only";
import { corporateBoard, type DashboardFacts } from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  corporateBoardHref,
  dashboardsErrorMessage,
  presentCorporateCard,
  previousReportPeriod,
  renderReportEmail,
  reportDue,
  reportPeriod,
  reportSubject,
  todayIn,
  type DashboardFactsRow,
  type DashboardFilters,
  type KpiThreshold,
  type ReportDelivery,
  type ReportEmailsRepository,
  type ReportPeriod,
  type ReportSubscription,
  type Result,
  type SignedInState,
  usableCenters,
} from "@meguiars/domain";
import {
  createDashboardRepository,
  createReportEmailsRepository,
  toReportDelivery,
  toReportSubscription,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { breakpoints, colors, fontSize, radius, space } from "@meguiars/ui-tokens";
import { CORPORATE_SOURCES } from "./corporate";
import { emailConfigStatus, sendEmail } from "./email";

type FactsQuery = { sources: string[]; detailCenterIds: string[]; from: string; to: string };

/** URL pública de la app para el enlace del correo (o null: el correo va sin botón). */
export function siteUrl(): string | null {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  return vercel ? `https://${vercel}` : null;
}

export interface BuildReportInput {
  sub: ReportSubscription;
  /** Centros activos de la organización, en orden. */
  orgCenters: readonly { id: string; name: string }[];
  period: ReportPeriod;
  readFacts: (q: FactsQuery) => Promise<Result<DashboardFactsRow>>;
  thresholds: readonly KpiThreshold[];
  /** Centros donde quien lee tiene la capacidad (el cron: los del reporte; el autor es admin corporativo). */
  allowedCenters: (capability: string) => readonly string[];
}

/** Arma el correo con las mismas cifras del Tablero corporativo. */
export async function buildReportEmail(
  input: BuildReportInput,
): Promise<{ ok: true; subject: string; html: string; text: string } | { ok: false; error: string }> {
  const { sub, period } = input;
  const centers =
    sub.centerIds === null
      ? [...input.orgCenters]
      : input.orgCenters.filter((c) => sub.centerIds!.includes(c.id));
  if (centers.length === 0) return { ok: false, error: "El reporte no tiene centros activos" };
  const ids = centers.map((c) => c.id);
  const previous = previousReportPeriod(sub.frequency, period);
  const read = (p: ReportPeriod) =>
    input.readFacts({ sources: CORPORATE_SOURCES, detailCenterIds: ids, from: p.from, to: p.to });
  const [current, prior] = await Promise.all([read(period), read(previous)]);
  if (!current.ok) return { ok: false, error: dashboardsErrorMessage(current.error) };
  const ctx = {
    from: period.from,
    to: period.to,
    previous: prior.ok ? previous : null,
    centers,
    allowedCenters: input.allowedCenters,
    thresholds: input.thresholds,
  };
  const board = corporateBoard(
    current.data as DashboardFacts,
    prior.ok ? (prior.data as DashboardFacts) : null,
    ctx,
  );
  const filters: DashboardFilters = {
    centerIds: ids,
    period: "personalizado",
    from: period.from,
    to: period.to,
    channel: null,
    engine: null,
  };
  const allIds = input.orgCenters.map((c) => c.id);
  const base = siteUrl();
  const { html, text } = renderReportEmail(
    {
      name: sub.name,
      frequency: sub.frequency,
      period,
      previous,
      centers,
      cards: board.map((r) => presentCorporateCard(r, filters, allIds)),
      boardUrl: base ? `${base}${corporateBoardHref(filters, allIds)}` : null,
    },
    colors,
    { space, fontSize, radius, content: breakpoints.tablet },
  );
  return { ok: true, subject: reportSubject(sub.name, period), html, text };
}

/** Arma, envía y deja el resultado en la bitácora. */
async function deliver(
  repo: ReportEmailsRepository,
  input: BuildReportInput,
  source: ReportDelivery["source"],
): Promise<{ ok: boolean; message: string }> {
  const built = await buildReportEmail(input);
  const sent = built.ok
    ? await sendEmail({
        to: input.sub.recipients,
        subject: built.subject,
        html: built.html,
        text: built.text,
        idempotencyKey:
          source === "cron" ? `reporte-${input.sub.id}-${input.period.from}-${input.period.to}` : undefined,
      })
    : ({ ok: false, error: built.error } as const);
  const recorded = await repo.recordDelivery({
    subscriptionId: input.sub.id,
    source,
    period: input.period,
    status: sent.ok ? "enviado" : "fallido",
    providerMessageId: sent.ok ? sent.id : null,
    error: sent.ok ? null : sent.error,
  });
  if (!sent.ok) return { ok: false, message: sent.error };
  if (!recorded.ok)
    return { ok: true, message: `Enviado, pero no quedó en la bitácora: ${recorded.error.message}` };
  return { ok: true, message: `Enviado a ${input.sub.recipients.length} destinatario(s).` };
}

export interface ScheduledReportsSummary {
  organizations: number;
  due: number;
  sent: number;
  failed: number;
  /** Programaciones activas sin autor (se borró su usuario): no se envían. */
  skippedWithoutAuthor: number;
  errors: string[];
}

/**
 * Envío programado (Vercel Cron, diario): por cada programación activa, el
 * último periodo cerrado si aún no se envió. Los hechos se leen con los
 * permisos del autor (public.report_subscription_facts); un periodo enviado
 * no se repite (índice único + Idempotency-Key en Resend).
 */
export async function runScheduledReports(service: MeguiarsSupabaseClient): Promise<ScheduledReportsSummary> {
  const out: ScheduledReportsSummary = {
    organizations: 0,
    due: 0,
    sent: 0,
    failed: 0,
    skippedWithoutAuthor: 0,
    errors: [],
  };
  const { data: rows, error } = await service.from("report_subscriptions").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  const subs = (rows ?? []).map(toReportSubscription);
  if (subs.length === 0) return out;
  const reports = createReportEmailsRepository(service);
  const dashboards = createDashboardRepository(service);
  for (const organizationId of [...new Set(subs.map((s) => s.organizationId))]) {
    const { data: centers, error: centersError } = await service
      .from("detail_centers")
      .select("id, name, timezone")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("created_at");
    if (centersError || !centers?.length) {
      out.errors.push(`${organizationId}: ${centersError?.message ?? "sin centros activos"}`);
      continue;
    }
    out.organizations += 1;
    const today = todayIn(centers[0]!.timezone);
    const orgSubs = subs.filter((s) => s.organizationId === organizationId);
    const { data: sentRows, error: sentError } = await service
      .from("report_deliveries")
      .select("*")
      .in(
        "subscription_id",
        orgSubs.map((s) => s.id),
      )
      .eq("source", "cron")
      .eq("status", "enviado")
      .gte("period_from", addDays(today, -40));
    if (sentError) {
      out.errors.push(`${organizationId}: ${sentError.message}`);
      continue;
    }
    const delivered = (sentRows ?? []).map(toReportDelivery);
    const limits = await dashboards.kpiThresholds(organizationId);
    for (const sub of orgSubs) {
      const period = reportDue(sub, today, delivered);
      if (!period) continue;
      if (!sub.createdBy) {
        out.skippedWithoutAuthor += 1;
        continue;
      }
      out.due += 1;
      const ids = sub.centerIds ?? centers.map((c) => c.id);
      const r = await deliver(
        reports,
        {
          sub,
          orgCenters: centers,
          period,
          readFacts: (q) => reports.subscriptionFacts(sub.id, q),
          thresholds: limits.ok ? limits.data : [],
          allowedCenters: () => ids,
        },
        "cron",
      );
      if (r.ok) out.sent += 1;
      else {
        out.failed += 1;
        out.errors.push(`${sub.id}: ${r.message}`);
      }
    }
  }
  return out;
}

/** «Enviar ahora» del admin corporativo: último periodo cerrado, con sus propios permisos. */
export async function sendReportNow(input: {
  client: MeguiarsSupabaseClient;
  sub: ReportSubscription;
  orgCenters: readonly { id: string; name: string; timezone: string }[];
  allowedCenters: (capability: string) => readonly string[];
}): Promise<{ ok: boolean; message: string }> {
  if (!emailConfigStatus().ready) return { ok: false, message: "El envío de correos no está configurado." };
  const first = input.orgCenters[0];
  if (!first) return { ok: false, message: "La organización no tiene centros activos." };
  const dashboards = createDashboardRepository(input.client);
  const limits = await dashboards.kpiThresholds(input.sub.organizationId);
  return deliver(
    createReportEmailsRepository(input.client),
    {
      sub: input.sub,
      orgCenters: input.orgCenters,
      period: reportPeriod(input.sub.frequency, todayIn(first.timezone)),
      readFacts: (q) => dashboards.facts({ ...q, grain: "total" }),
      thresholds: limits.ok ? limits.data : [],
      allowedCenters: input.allowedCenters,
    },
    "manual",
  );
}

/** Organización del centro activo y sus centros activos visibles (para nombres, opciones y «Enviar ahora»). */
export function reportScope(state: SignedInState) {
  const active = activeCenterAccess(state)!.center;
  const orgCenters = usableCenters(state.access)
    .filter((a) => a.center.organizationId === active.organizationId)
    .map((a) => ({ id: a.center.id, name: a.center.name, timezone: a.center.timezone }));
  return {
    organizationId: active.organizationId,
    timezone: active.timezone,
    today: todayIn(active.timezone),
    orgCenters,
  };
}
