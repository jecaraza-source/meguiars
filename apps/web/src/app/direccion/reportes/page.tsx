import {
  activeTone,
  dashboardsErrorMessage,
  formatInCenterTimeZone,
  REPORT_DELIVERY_SOURCE_LABELS,
  REPORT_DELIVERY_STATUS_TONES,
  REPORT_FREQUENCY_HINTS,
  REPORT_FREQUENCY_LABELS,
  reportCentersText,
  reportEmailsCopy,
  reportPeriod,
  reportPeriodLabel,
} from "@meguiars/domain";
import { createReportEmailsRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DeleteReportForm, ReportSubscriptionForm, SendReportNowForm } from "@/components/report-email-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { canManageDashboards } from "@/lib/dashboards";
import { emailConfigStatus } from "@/lib/email";
import { reportScope } from "@/lib/report-emails";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dirección → Reportes por correo: el admin corporativo programa el envío del
 * Tablero corporativo (diario, semanal, quincenal o mensual) a los correos de
 * Dirección. Un cron diario manda cada periodo cerrado una sola vez; la
 * bitácora muestra cada envío y su resultado real.
 */
export default async function ReportEmailsPage({ searchParams }: PageProps<"/direccion/reportes">) {
  const state = await requireScreen("reportEmails");
  const params = await searchParams;
  const manage = canManageDashboards(state);
  const scope = reportScope(state);
  const repo = createReportEmailsRepository((await createSupabaseServerClient())!);
  const [subs, deliveries] = manage
    ? await Promise.all([repo.subscriptions(scope.organizationId), repo.deliveries(scope.organizationId)])
    : [null, null];
  const email = emailConfigStatus();
  const names = Object.fromEntries(scope.orgCenters.map((c) => [c.id, c.name]));
  const editId = typeof params.editar === "string" ? params.editar : null;
  const list = subs?.ok ? subs.data : [];
  const editing = editId ? (list.find((s) => s.id === editId) ?? null) : null;
  const error = subs && !subs.ok ? dashboardsErrorMessage(subs.error) : null;
  const done =
    params.hecho === "guardado"
      ? "Reporte guardado."
      : params.hecho === "borrado"
        ? "Reporte borrado."
        : null;

  return (
    <AppShell
      state={state}
      screen="reportEmails"
      title={reportEmailsCopy.title}
      description={reportEmailsCopy.description}
    >
      {done ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {done}
        </p>
      ) : null}
      {!manage ? <EmptyState title="Sólo el admin corporativo programa los reportes por correo." /> : null}
      {manage ? (
        <p
          className="mg-tone rounded-md border p-md text-sm"
          data-tone={email.ready ? "success" : "warning"}
          data-testid="email-status"
        >
          {email.ready ? reportEmailsCopy.configured : reportEmailsCopy.notConfigured}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {error}
        </p>
      ) : null}
      {manage && !error && list.length === 0 ? (
        <EmptyState title={reportEmailsCopy.empty} message={reportEmailsCopy.emptyHint} />
      ) : null}
      {list.length > 0 ? (
        <ul className="flex flex-col gap-sm" data-testid="report-list">
          {list.map((s) => {
            const next = reportPeriod(s.frequency, scope.today);
            return (
              <li key={s.id} className="mg-card flex flex-col gap-xs" data-testid={`report-${s.id}`}>
                <div className="flex flex-wrap items-center gap-xs">
                  <Badge
                    label={s.active ? reportEmailsCopy.active : reportEmailsCopy.paused}
                    tone={activeTone(s.active)}
                  />
                  <Badge label={REPORT_FREQUENCY_LABELS[s.frequency]} tone="info" />
                  <span className="font-medium">{s.name}</span>
                  <Link href={`/direccion/reportes?editar=${s.id}`} className="text-sm underline">
                    Editar
                  </Link>
                </div>
                <p className="text-sm">{REPORT_FREQUENCY_HINTS[s.frequency]}</p>
                <p className="text-xs text-muted">
                  {reportCentersText(s.centerIds, names)} · {s.recipients.join(", ")}
                </p>
                <p className="text-xs text-muted">Último periodo cerrado: {reportPeriodLabel(next)}</p>
                <div className="flex flex-wrap items-start gap-md">
                  <SendReportNowForm id={s.id} disabled={!email.ready} />
                  <details>
                    <summary className="cursor-pointer text-sm underline">Borrar</summary>
                    <DeleteReportForm id={s.id} />
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {manage ? (
        <Card
          title={editing ? `Editar: ${editing.name}` : "Nuevo reporte por correo"}
          subtitle="Lleva las cifras del Tablero corporativo (ventas, EBITDA, margen, vehículos, ticket, membresías, recurrencia y B2B) contra el periodo anterior."
        >
          <ReportSubscriptionForm
            key={editing?.id ?? "nuevo"}
            organizationId={scope.organizationId}
            subscription={editing}
            centers={scope.orgCenters}
          />
        </Card>
      ) : null}
      {deliveries?.ok ? (
        <Card title={reportEmailsCopy.history} subtitle={reportEmailsCopy.sendNowHint}>
          {deliveries.data.length === 0 ? (
            <p className="text-sm text-muted">{reportEmailsCopy.noDeliveries}</p>
          ) : (
            <div className="relative min-w-0 overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="report-deliveries">
                <thead className="bg-surface">
                  <tr>
                    {["Fecha", "Reporte", "Periodo", "Origen", "Estado", "Destinatarios"].map((h) => (
                      <th key={h} scope="col" className="px-sm py-xs text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveries.data.map((d) => (
                    <tr key={d.id} className="border-t border-border align-top">
                      <td className="px-sm py-xs whitespace-nowrap">
                        {formatInCenterTimeZone(d.createdAt, scope.timezone)}
                      </td>
                      <td className="px-sm py-xs">{d.subscriptionName}</td>
                      <td className="px-sm py-xs whitespace-nowrap">
                        {reportPeriodLabel({ from: d.periodFrom, to: d.periodTo })}
                      </td>
                      <td className="px-sm py-xs">{REPORT_DELIVERY_SOURCE_LABELS[d.source]}</td>
                      <td className="px-sm py-xs">
                        <Badge
                          label={d.status === "enviado" ? "Enviado" : "Falló"}
                          tone={REPORT_DELIVERY_STATUS_TONES[d.status]}
                        />
                        {d.error ? <p className="text-xs text-danger">{d.error}</p> : null}
                      </td>
                      <td className="px-sm py-xs">{d.recipients.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </AppShell>
  );
}
