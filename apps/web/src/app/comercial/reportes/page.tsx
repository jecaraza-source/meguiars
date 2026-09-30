import { COMMERCIAL_COPY, PILOT_PERIODS, todayIn, activeCenterAccess } from "@meguiars/domain";
import { createCommercialRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { commercialCenters, loadCommercialReport } from "@/lib/commercial";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Reportes comerciales: embudo, tiempo de respuesta, ventas y margen atribuidos, por canal y responsable. */
export default async function CommercialReportsPage({ searchParams }: PageProps<"/comercial/reportes">) {
  const state = await requireScreen("commercialReports");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const periodId = typeof params.periodo === "string" ? params.periodo : "30";
  const scope = params.alcance === "todos" ? "todos" : "centro";
  const all = commercialCenters(state, "commercial.metrics.read");
  const centers = scope === "todos" ? all : all.filter((c) => c.id === center.id);
  const supabase = (await createSupabaseServerClient())!;
  const repo = createCommercialRepository(supabase);
  const owners = await repo.leadOwners(center.id);
  const report = await loadCommercialReport(
    repo,
    centers,
    periodId,
    todayIn(center.timezone),
    Object.fromEntries((owners.ok ? owners.data : []).map((o) => [o.userId, o.fullName])),
  );
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ periodo: report.period.id, alcance: scope, ...patch });
    return `/comercial/reportes?${q.toString()}`;
  };
  const breakdown = (rows: typeof report.bySource, caption: string) => (
    <Table
      caption={caption}
      rows={rows}
      rowKey={(r) => r.key || "-"}
      emptyMessage={COMMERCIAL_COPY.noData}
      columns={[
        { key: "label", header: caption, value: (r) => r.label },
        { key: "leads", header: "Prospectos", align: "end", value: (r) => String(r.leads) },
        { key: "quoted", header: "Cotizados", align: "end", value: (r) => String(r.quoted) },
        { key: "booked", header: "Reservaron", align: "end", value: (r) => String(r.booked) },
        { key: "won", header: "Compraron", align: "end", value: (r) => String(r.won) },
        { key: "conv", header: "Prospecto → reserva", align: "end", value: (r) => r.leadToBookingLabel },
        { key: "resp", header: "1.ª respuesta", align: "end", value: (r) => r.responseLabel },
        { key: "sales", header: "Ventas", align: "end", value: (r) => r.salesLabel },
        { key: "margin", header: "Margen", align: "end", value: (r) => r.marginLabel },
      ]}
    />
  );
  return (
    <AppShell
      state={state}
      screen="commercialReports"
      title={COMMERCIAL_COPY.reportsTitle}
      description={centers.map((c) => c.name).join(" · ")}
    >
      <div className="flex flex-wrap gap-xs">
        {PILOT_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={link({ periodo: p.id })}
            className="mg-badge"
            data-tone={p.id === report.period.id ? "brand" : "neutral"}
          >
            {p.label}
          </Link>
        ))}
        {all.length > 1 ? (
          <>
            <Link
              href={link({ alcance: "centro" })}
              className="mg-badge"
              data-tone={scope === "centro" ? "brand" : "neutral"}
            >
              Centro activo
            </Link>
            <Link
              href={link({ alcance: "todos" })}
              className="mg-badge"
              data-tone={scope === "todos" ? "brand" : "neutral"}
            >
              Todos mis centros
            </Link>
          </>
        ) : null}
      </div>
      <p className="text-sm text-muted">
        Del {report.period.from} al {report.period.to}. Cohorte de prospectos registrados en el periodo; cada
        venta es la OS entregada que ganó al prospecto (reserva de su cotización o atribución manual) y se
        cuenta una sola vez. Las ventas sin prospecto están en el P&L. Fuente: datos internos de la plataforma
        (todavía no hay datos de proveedores ni inversión).
      </p>
      {report.error ? (
        <EmptyState title="No se pudieron calcular los reportes" message={report.error} />
      ) : null}
      <div className="grid gap-md md:grid-cols-3 xl:grid-cols-4" data-testid="commercial-kpis">
        {report.kpis.map((k) => (
          <KpiCard key={k.id} label={k.name} value={k.display} caption={k.formula} />
        ))}
      </div>
      <Card title="Por canal de origen">{breakdown(report.bySource, "Canal")}</Card>
      <Card title="Por responsable">{breakdown(report.byOwner, "Responsable")}</Card>
      {scope === "todos" ? <Card title="Por centro">{breakdown(report.byCenter, "Centro")}</Card> : null}
      <Card title="Motivos de pérdida">
        {report.losses.length === 0 ? (
          <p className="text-sm text-muted">{COMMERCIAL_COPY.noData}</p>
        ) : (
          <ul className="flex flex-col gap-xs text-sm">
            {report.losses.map((l) => (
              <li key={l.reason}>
                {l.label}: {l.count}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted">
        Inversión publicitaria, costo por prospecto y por cliente, ROAS e ingresos atribuidos por campaña
        están en el Panel comercial; nunca se muestran en cero.
      </p>
    </AppShell>
  );
}
