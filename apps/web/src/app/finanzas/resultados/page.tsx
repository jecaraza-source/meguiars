import { pnlGrossMargin, pnlStatement } from "@meguiars/analytics";
import {
  activeCenterAccess,
  can,
  expenseErrorMessage,
  expensesCopy,
  formatMoney,
  PNL_RANGE_LABELS,
  PNL_RANGES,
  pnlRange,
  todayIn,
  usableCenters,
  type PnlRangeKey,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Estado de resultados por centro o consolidado (sin doble conteo de insumos). */
export default async function PnlPage({ searchParams }: PageProps<"/finanzas/resultados">) {
  const state = await requireScreen("pnl");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const all = params.alcance === "todos";
  const key: PnlRangeKey = PNL_RANGES.includes(params.rango as PnlRangeKey)
    ? (params.rango as PnlRangeKey)
    : "mes";
  const { from, to } = pnlRange(key, todayIn(center.timezone));
  const centers = all
    ? usableCenters(state.access)
        .filter((a) => can([...a.roles, ...a.corporateRoles], "expenses.read"))
        .map((a) => a.center.id)
    : [center.id];
  const facts = await createExpenseRepository((await createSupabaseServerClient())!).pnlFacts(
    centers,
    from,
    to,
  );
  const input = { facts: facts.ok ? facts.data : [] };
  const s = pnlStatement(input);
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { alcance: all ? "todos" : undefined, rango: key === "mes" ? undefined : key, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const str = q.toString();
    return str ? `/finanzas/resultados?${str}` : "/finanzas/resultados";
  };

  return (
    <AppShell
      state={state}
      screen="pnl"
      title={expensesCopy.pnlTitle}
      description={expensesCopy.pnlDescription}
    >
      <Card
        subtitle={`${PNL_RANGE_LABELS[key]} (${from} a ${to}) · ${all ? expensesCopy.scopeAll : center.name}`}
        actions={
          <nav className="flex flex-wrap gap-md text-sm" aria-label="Periodo">
            {PNL_RANGES.map((r) =>
              r === key ? (
                <strong key={r}>{PNL_RANGE_LABELS[r]}</strong>
              ) : (
                <Link key={r} href={link({ rango: r === "mes" ? undefined : r })} className="underline">
                  {PNL_RANGE_LABELS[r]}
                </Link>
              ),
            )}
            <Link href={link({ alcance: all ? undefined : "todos" })} className="underline">
              {all ? expensesCopy.scopeCenter : expensesCopy.scopeAll}
            </Link>
          </nav>
        }
      >
        {!facts.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {expenseErrorMessage(facts.error)}
          </p>
        ) : input.facts.length === 0 ? (
          <EmptyState title={expensesCopy.pnlEmpty} />
        ) : (
          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4" data-testid="pnl-kpis">
            <KpiCard label="Ventas" value={formatMoney(s.revenue)} />
            <KpiCard
              label="Utilidad bruta"
              value={formatMoney(s.grossProfit)}
              caption={`Margen ${pnlGrossMargin.compute(input)} %`}
            />
            <KpiCard label="Utilidad de operación" value={formatMoney(s.operatingProfit)} />
            <KpiCard label="Utilidad antes de impuestos" value={formatMoney(s.netBeforeTax)} />
          </div>
        )}
      </Card>
      {facts.ok && input.facts.length > 0 ? (
        <>
          <Card title={expensesCopy.pnlTitle} subtitle={expensesCopy.modelNote}>
            <Table
              caption={expensesCopy.pnlTitle}
              rows={s.lines}
              rowKey={(l) => l.key}
              emptyMessage={expensesCopy.pnlEmpty}
              columns={[
                {
                  key: "label",
                  header: "Concepto",
                  value: (l) => (l.level === 1 ? `   ${l.label}` : l.label),
                },
                { key: "amount", header: "Importe", value: (l) => formatMoney(l.amount), align: "end" },
                {
                  key: "percent",
                  header: "% de ventas",
                  value: (l) => (l.percent === null ? "—" : `${l.percent} %`),
                  align: "end",
                },
              ]}
            />
          </Card>
          <Card title={expensesCopy.cashOut}>
            <dl className="grid gap-sm text-sm md:grid-cols-2" data-testid="pnl-cash">
              <div>
                <dt className="text-muted">{expensesCopy.cashOut}</dt>
                <dd className="font-medium">{formatMoney(s.cashOut)}</dd>
              </div>
              <div>
                <dt className="text-muted">{expensesCopy.pending}</dt>
                <dd>{formatMoney(s.pending)}</dd>
              </div>
            </dl>
          </Card>
        </>
      ) : null}
    </AppShell>
  );
}
