import { sectionCopy } from "@meguiars/domain";
import {
  createCashRepository,
  createDashboardRepository,
  createDayRepository,
  createPaymentRepository,
  createPnlRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BarList, ColumnChart } from "@/components/charts";
import { Card, EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadFinanceCharts } from "@/lib/charts";
import { loadFinanceSummary } from "@/lib/day";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Resumen financiero del centro activo: resultado del mes, cobrado hoy, por cobrar y caja. */
export default async function FinanceSummaryPage() {
  const state = await requireScreen("finanzas");
  const client = (await createSupabaseServerClient())!;
  const [s, charts] = await Promise.all([
    loadFinanceSummary(state, {
      pnl: createPnlRepository(client),
      payments: createPaymentRepository(client),
      cash: createCashRepository(client),
      day: createDayRepository(client),
    }),
    loadFinanceCharts(state, createDashboardRepository(client)),
  ]);
  const copy = sectionCopy.finanzas;
  return (
    <AppShell
      state={state}
      screen="finanzas"
      title={copy.title}
      description={`${copy.description} · ${s.center.name}`}
    >
      {s.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {s.error}
        </p>
      ) : null}
      {s.kpis.length === 0 && !s.error ? (
        <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} />
      ) : null}
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="finance-kpis">
        {s.kpis.map((k) => (
          <Link
            key={k.key}
            href={k.href}
            className="block rounded-lg focus-visible:outline"
            aria-label={`${k.label}: ${k.value}`}
          >
            <KpiCard label={k.label} value={k.value} {...(k.caption ? { caption: k.caption } : {})} />
          </Link>
        ))}
      </div>
      {charts.daily ? (
        <Card title="Ventas por día" subtitle="Últimos 30 días · ventas del estado de resultados">
          <div data-testid="chart-daily">
            <ColumnChart data={charts.daily} caption="Ventas por día, últimos 30 días" labelEvery={5} />
          </div>
        </Card>
      ) : null}
      <div className="grid gap-lg lg:grid-cols-2">
        {charts.monthly ? (
          <Card
            title="Resultado por mes"
            subtitle="Últimos 6 meses; el mes en curso va a la fecha. EBITDA = utilidad bruta − personal − gastos."
          >
            <div data-testid="chart-monthly">
              <ColumnChart data={charts.monthly} caption="Ventas, utilidad bruta y EBITDA por mes" />
            </div>
          </Card>
        ) : null}
        {charts.methods && charts.methods.length > 0 ? (
          <Card title="Cobranza por forma de pago" subtitle="Últimos 30 días · recibos válidos">
            <div data-testid="chart-methods">
              <BarList rows={charts.methods} caption="Cobranza por forma de pago, últimos 30 días" />
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
