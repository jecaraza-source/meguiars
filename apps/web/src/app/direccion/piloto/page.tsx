import { PILOT_COPY, PILOT_PERIODS } from "@meguiars/domain";
import { createPilotRepository, createPnlRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadPilot } from "@/lib/pilot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Dirección → Piloto: adopción diaria y resultado contra la línea base de cada centro. */
export default async function PilotPage({ searchParams }: PageProps<"/direccion/piloto">) {
  const state = await requireScreen("pilot");
  const sp = await searchParams;
  const supabase = (await createSupabaseServerClient())!;
  const view = await loadPilot(
    state,
    { pilot: createPilotRepository(supabase), pnl: createPnlRepository(supabase) },
    {
      period: typeof sp.periodo === "string" ? sp.periodo : null,
      scope: typeof sp.alcance === "string" ? sp.alcance : null,
    },
  );
  const href = (periodo: string, alcance: string) =>
    `/direccion/piloto?periodo=${periodo}&alcance=${alcance}`;
  const scope = view.scopeAll ? "todos" : "centro";
  const t = view.adoption.totals;
  return (
    <AppShell
      state={state}
      screen="pilot"
      title={PILOT_COPY.pilotTitle}
      description={PILOT_COPY.pilotDescription}
    >
      <nav aria-label={PILOT_COPY.period} className="flex flex-wrap items-center gap-xs text-sm">
        {PILOT_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={href(p.id, scope)}
            aria-current={p.id === view.period.id ? "page" : undefined}
            className="mg-badge aria-[current=page]:font-bold"
          >
            {p.label}
          </Link>
        ))}
        {view.canScopeAll ? (
          <Link href={href(view.period.id, view.scopeAll ? "centro" : "todos")} className="underline">
            {view.scopeAll ? "Sólo el centro activo" : "Todos mis centros"}
          </Link>
        ) : null}
        <span className="text-muted">
          {view.period.from} a {view.period.to}
        </span>
      </nav>
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4" data-testid="pilot-kpis">
        <KpiCard
          label="Usuarios activos por día"
          value={String(t.avgActiveUsers)}
          caption={`Máximo ${t.maxActiveUsers}`}
        />
        <KpiCard
          label="OS creadas / entregadas"
          value={`${t.ordersCreated} / ${t.ordersDelivered}`}
          caption={`${t.ordersCancelled} canceladas`}
        />
        <KpiCard label="Cortes de caja" value={String(t.cashClosings)} />
        <KpiCard label="Errores de la app" value={String(t.errors)} />
      </div>
      {view.centers.map((c) => (
        <Card key={c.id} title={`${PILOT_COPY.comparison} · ${c.name}`}>
          <ul className="flex flex-col gap-xs" data-testid={`pilot-comparison-${c.id}`}>
            {c.comparison.map((r) => (
              <li
                key={r.metric}
                className="flex flex-wrap items-center gap-xs border-b border-border pb-xs text-sm"
              >
                <span className="min-w-0 flex-1 font-medium">{r.label}</span>
                <span className="text-muted">Base {r.baseline}</span>
                <span>Piloto {r.actual}</span>
                <span className="text-muted">{r.delta}</span>
                <Badge label={r.statusLabel} tone={r.tone} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Card title={PILOT_COPY.adoption}>
        <Table
          caption={PILOT_COPY.adoption}
          emptyMessage={PILOT_COPY.noData}
          rows={view.adoption.days}
          rowKey={(d) => d.day}
          columns={[
            { key: "d", header: "Día", value: (d) => d.day },
            { key: "u", header: "Usuarios", value: (d) => String(d.activeUsers), align: "end" },
            { key: "c", header: "OS creadas", value: (d) => String(d.ordersCreated), align: "end" },
            { key: "e", header: "Entregadas", value: (d) => String(d.ordersDelivered), align: "end" },
            { key: "x", header: "Canceladas", value: (d) => String(d.ordersCancelled), align: "end" },
            {
              key: "k",
              header: "Dif. de caja",
              value: (d) => (d.cashClosings ? d.cashDifference : "—"),
              align: "end",
            },
            { key: "r", header: "Errores", value: (d) => String(d.errors), align: "end" },
          ]}
        />
      </Card>
    </AppShell>
  );
}
