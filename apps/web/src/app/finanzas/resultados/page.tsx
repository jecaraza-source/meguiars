import {
  pnlByCenter,
  pnlEbitda,
  pnlGrossProfit,
  pnlNetBeforeTax,
  pnlRevenue,
  type PnlDrill,
  type PnlStatement,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  can,
  formatMoney,
  formatPercent,
  PNL_PERIOD_LABELS,
  PNL_PERIODS,
  pnlCopy,
  pnlDrillParams,
  pnlErrorMessage,
  pnlItemLabel,
  pnlPeriod,
  pnlPeriodError,
  pnlStatementCsv,
  todayIn,
  usableCenters,
  type PnlPeriodKey,
} from "@meguiars/domain";
import { createPnlRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CsvExport } from "@/components/pnl-export";
import { Card, EmptyState, KpiCard } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Estado de resultados gerencial por centro y consolidado, con drill-down a los movimientos. */
export default async function PnlPage({ searchParams }: PageProps<"/finanzas/resultados">) {
  const state = await requireScreen("pnl");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const all = params.alcance === "todos";
  const key: PnlPeriodKey = PNL_PERIODS.includes(params.periodo as PnlPeriodKey)
    ? (params.periodo as PnlPeriodKey)
    : "mes";
  const today = todayIn(center.timezone);
  const { from, to } = pnlPeriod(key, today, { from: one(params.desde), to: one(params.hasta) });
  const periodError = pnlPeriodError(from, to);
  const allowed = usableCenters(state.access).filter((a) =>
    can([...a.roles, ...a.corporateRoles], "pnl.read"),
  );
  const centers = all ? allowed.map((a) => a.center) : [center];
  const result = periodError
    ? null
    : await createPnlRepository((await createSupabaseServerClient())!).lines(
        centers.map((c) => c.id),
        from,
        to,
      );
  const facts = result?.ok ? result.data : [];
  const { centers: byCenter, consolidated } = pnlByCenter(
    facts,
    centers.map((c) => c.id),
  );
  const multi = all && centers.length > 1;
  const columns: { id: string | null; name: string; s: PnlStatement }[] = [
    ...(multi ? byCenter : []).map((c) => ({
      id: c.detailCenterId,
      name: centers.find((x) => x.id === c.detailCenterId)?.name ?? "",
      s: c.statement,
    })),
    { id: null, name: multi ? pnlCopy.consolidated : center.name, s: consolidated },
  ];
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = {
      alcance: all ? "todos" : undefined,
      periodo: key === "mes" ? undefined : key,
      desde: key === "personalizado" ? from : undefined,
      hasta: key === "personalizado" ? to : undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/finanzas/resultados?${s}` : "/finanzas/resultados";
  };
  const drillHref = (drill: PnlDrill, centerId: string | null) =>
    `/finanzas/resultados/detalle?${pnlDrillParams(drill, { from, to, all })}${centerId ? `&centro=${centerId}` : ""}`;
  const csv = pnlStatementCsv(
    columns.map((c) => ({ name: c.name, lines: c.s.lines })),
    { from, to },
  );

  return (
    <AppShell state={state} screen="pnl" title={pnlCopy.title} description={pnlCopy.description}>
      <Card
        subtitle={`${PNL_PERIOD_LABELS[key]}: ${from} a ${to} · ${all ? pnlCopy.scopeAll : center.name}`}
        actions={
          <nav className="flex flex-wrap gap-md text-sm print:hidden" aria-label={pnlCopy.period}>
            {PNL_PERIODS.filter((p) => p !== "personalizado").map((p) =>
              p === key ? (
                <strong key={p}>{PNL_PERIOD_LABELS[p]}</strong>
              ) : (
                <Link
                  key={p}
                  href={link({ periodo: p === "mes" ? undefined : p, desde: undefined, hasta: undefined })}
                  className="underline"
                >
                  {PNL_PERIOD_LABELS[p]}
                </Link>
              ),
            )}
            <Link href={link({ alcance: all ? undefined : "todos" })} className="underline">
              {all ? pnlCopy.scopeCenter : pnlCopy.scopeAll}
            </Link>
          </nav>
        }
      >
        <form method="get" className="flex flex-wrap items-end gap-sm print:hidden" data-testid="pnl-custom">
          {all ? <input type="hidden" name="alcance" value="todos" /> : null}
          <input type="hidden" name="periodo" value="personalizado" />
          <Input name="desde" type="date" label={pnlCopy.from} defaultValue={from} />
          <Input name="hasta" type="date" label={pnlCopy.to} defaultValue={to} />
          <button type="submit" className="mb-sm text-sm underline">
            {PNL_PERIOD_LABELS.personalizado}: {pnlCopy.apply}
          </button>
        </form>
        {periodError ? (
          <p role="alert" className="mg-tone mt-md rounded-md border p-md text-sm" data-tone="danger">
            {periodError}
          </p>
        ) : result && !result.ok ? (
          <p role="alert" className="mg-tone mt-md rounded-md border p-md text-sm" data-tone="danger">
            {pnlErrorMessage(result.error)}
          </p>
        ) : facts.length === 0 ? (
          <EmptyState title={pnlCopy.empty} />
        ) : (
          <div className="mt-md grid gap-lg md:grid-cols-2 lg:grid-cols-4" data-testid="pnl-kpis">
            <KpiCard label={pnlRevenue.name} value={formatMoney(consolidated.revenue)} />
            <KpiCard
              label={pnlGrossProfit.name}
              value={formatMoney(consolidated.grossProfit)}
              caption={`Margen ${formatPercent(consolidated.grossMargin)}`}
            />
            <KpiCard
              label={pnlEbitda.name}
              value={formatMoney(consolidated.ebitda)}
              caption={`Margen ${formatPercent(consolidated.ebitdaMargin)}`}
            />
            <KpiCard label={pnlNetBeforeTax.name} value={formatMoney(consolidated.netBeforeTax)} />
          </div>
        )}
      </Card>

      {facts.length > 0 ? (
        <>
          <Card
            title={pnlCopy.title}
            subtitle={pnlCopy.drillHint}
            actions={
              <CsvExport
                csv={csv}
                filename={`estado-de-resultados-${from}-${to}.csv`}
                label={pnlCopy.exportCsv}
                printLabel={pnlCopy.print}
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="pnl-statement">
                <caption className="sr-only">{pnlCopy.title}</caption>
                <thead className="bg-surface">
                  <tr>
                    <th scope="col" className="px-md py-sm text-left font-medium">
                      Concepto
                    </th>
                    {columns.map((c) => (
                      <th key={c.name} scope="col" colSpan={2} className="px-md py-sm text-right font-medium">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consolidated.lines.map((l) => (
                    <tr
                      key={l.key}
                      className={`border-t border-border ${l.level === 0 ? "font-semibold" : ""}`}
                      data-line={l.key}
                    >
                      <th
                        scope="row"
                        className={`px-md py-sm text-left ${l.level === 1 ? "pl-xl font-normal" : ""}`}
                      >
                        {l.label}
                      </th>
                      {columns.map((c) => {
                        const cl = c.s.lines.find((x) => x.key === l.key);
                        const amount = cl?.amount ?? 0;
                        return [
                          <td key={`${c.name}-a`} className="px-md py-sm text-right tabular-nums">
                            {cl?.drill && amount !== 0 ? (
                              <Link href={drillHref(cl.drill, c.id)} className="underline">
                                {formatMoney(amount)}
                              </Link>
                            ) : (
                              formatMoney(amount)
                            )}
                          </td>,
                          <td key={`${c.name}-p`} className="px-md py-sm text-right text-muted tabular-nums">
                            {formatPercent(cl?.percent ?? null)}
                          </td>,
                        ];
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={pnlCopy.byEngine}>
            <table className="w-full border-collapse text-sm" data-testid="pnl-engines">
              <caption className="sr-only">{pnlCopy.byEngine}</caption>
              <thead className="bg-surface">
                <tr>
                  <th scope="col" className="px-md py-sm text-left font-medium">
                    {pnlCopy.engine}
                  </th>
                  <th scope="col" className="px-md py-sm text-right font-medium">
                    {pnlCopy.amount}
                  </th>
                  <th scope="col" className="px-md py-sm text-right font-medium">
                    {pnlCopy.share}
                  </th>
                </tr>
              </thead>
              <tbody>
                {consolidated.revenueByEngine.map((e) => (
                  <tr key={e.engine} className="border-t border-border">
                    <th scope="row" className="px-md py-sm text-left font-normal">
                      {pnlItemLabel(e.engine)}
                    </th>
                    <td className="px-md py-sm text-right tabular-nums">
                      <Link href={drillHref(e.drill, null)} className="underline">
                        {formatMoney(e.amount)}
                      </Link>
                    </td>
                    <td className="px-md py-sm text-right text-muted tabular-nums">
                      {formatPercent(e.percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title={pnlCopy.outside}>
            <dl className="grid gap-sm text-sm md:grid-cols-3" data-testid="pnl-outside">
              <div>
                <dt className="text-muted">{pnlCopy.suppliesPurchases}</dt>
                <dd className="font-medium">
                  <Link
                    href={drillHref({ section: "fuera_pnl", line: "insumos" }, null)}
                    className="underline"
                  >
                    {formatMoney(consolidated.suppliesPurchases)}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted">{pnlCopy.pending}</dt>
                <dd>
                  <Link
                    href={drillHref({ section: "fuera_pnl", line: "pendiente" }, null)}
                    className="underline"
                  >
                    {formatMoney(consolidated.pending)}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted">{pnlCopy.cashOut}</dt>
                <dd>{formatMoney(consolidated.cashOut)}</dd>
              </div>
            </dl>
          </Card>
        </>
      ) : null}

      <Card title={pnlCopy.formulas} subtitle={pnlCopy.formulasNote}>
        <dl className="grid gap-sm text-sm md:grid-cols-2" data-testid="pnl-formulas">
          {[pnlRevenue, pnlGrossProfit, pnlEbitda, pnlNetBeforeTax].map((k) => (
            <div key={k.id}>
              <dt className="font-medium">{k.name}</dt>
              <dd className="text-muted">{k.formula}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </AppShell>
  );
}
