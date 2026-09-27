import {
  activeCenterAccess,
  can,
  canInCenter,
  formatMoney,
  parsePnlDrill,
  PNL_SOURCE_TARGETS,
  pnlCopy,
  pnlDrillTitle,
  pnlErrorMessage,
  pnlMovementsCsv,
  pnlMovementsTotal,
  pnlPeriodError,
  presentPnlMovement,
  usableCenters,
} from "@meguiars/domain";
import { createPnlRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CsvExport } from "@/components/pnl-export";
import { Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Movimientos que explican una cifra del estado de resultados (su suma es la cifra). */
export default async function PnlDrilldownPage({ searchParams }: PageProps<"/finanzas/resultados/detalle">) {
  const state = await requireScreen("pnlDrilldown");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const drill = parsePnlDrill(params);
  const allowed = usableCenters(state.access).filter((a) =>
    can([...a.roles, ...a.corporateRoles], "pnl.read"),
  );
  const names = new Map(allowed.map((a) => [a.center.id, a.center.name]));
  const only = typeof params.centro === "string" ? params.centro : undefined;
  const centers = only
    ? allowed.filter((a) => a.center.id === only).map((a) => a.center.id)
    : drill?.all
      ? allowed.map((a) => a.center.id)
      : [center.id];
  const from = drill?.from ?? "";
  const to = drill?.to ?? "";
  const periodError = drill ? pnlPeriodError(from, to) : null;
  const back = `/finanzas/resultados?${new URLSearchParams({
    periodo: "personalizado",
    desde: from,
    hasta: to,
    ...(drill?.all ? { alcance: "todos" } : {}),
  }).toString()}`;
  const backLink = (
    <Link href={back} className="text-sm underline print:hidden">
      ← {pnlCopy.back}
    </Link>
  );

  if (!drill || periodError || centers.length === 0) {
    return (
      <AppShell state={state} screen="pnlDrilldown" title={pnlCopy.drillTitle}>
        {backLink}
        <EmptyState title={pnlCopy.drillEmpty} message={periodError ?? undefined} />
      </AppShell>
    );
  }

  const title = pnlDrillTitle(drill);
  const result = await createPnlRepository((await createSupabaseServerClient())!).drilldown({
    detailCenterIds: centers,
    from,
    to,
    section: drill.section,
    line: drill.line,
    dimension: drill.dimension,
  });
  const rows = result.ok ? result.data : [];
  const scope = only ? (names.get(only) ?? "") : drill.all ? pnlCopy.scopeAll : center.name;

  return (
    <AppShell
      state={state}
      screen="pnlDrilldown"
      title={`${pnlCopy.drillTitle}: ${title}`}
      description={`${from} a ${to} · ${scope}`}
    >
      {backLink}
      <Card
        title={title}
        subtitle={pnlCopy.drillHint}
        actions={
          rows.length > 0 ? (
            <CsvExport
              csv={pnlMovementsCsv(
                rows,
                (id) => names.get(id) ?? "",
                `${title} · ${from} a ${to} · ${scope}`,
              )}
              filename={`movimientos-${drill.section}-${drill.line ?? "todo"}-${from}-${to}.csv`}
              label={pnlCopy.exportCsv}
              printLabel={pnlCopy.print}
            />
          ) : null
        }
      >
        {!result.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {pnlErrorMessage(result.error)}
          </p>
        ) : rows.length === 0 ? (
          <EmptyState title={pnlCopy.drillEmpty} />
        ) : (
          <>
            <p className="mb-md text-sm">
              {pnlCopy.drillTotal}:{" "}
              <strong data-testid="pnl-drill-total">{formatMoney(pnlMovementsTotal(rows))}</strong> ·{" "}
              {rows.length} movimientos
            </p>
            {rows.length >= 5000 ? (
              <p className="mg-tone mb-md rounded-md border p-sm text-xs" data-tone="warning">
                {pnlCopy.drillTruncated}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="pnl-drill">
                <caption className="sr-only">{title}</caption>
                <thead className="bg-surface">
                  <tr>
                    {[pnlCopy.date, pnlCopy.center, pnlCopy.source, pnlCopy.reference, pnlCopy.detail].map(
                      (h) => (
                        <th key={h} scope="col" className="px-md py-sm text-left font-medium">
                          {h}
                        </th>
                      ),
                    )}
                    <th scope="col" className="px-md py-sm text-right font-medium">
                      {pnlCopy.amount}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m, i) => {
                    const target = PNL_SOURCE_TARGETS[m.source];
                    const href = canInCenter(state, m.detailCenterId, target.capability)
                      ? target.href(m.sourceId)
                      : null;
                    const r = presentPnlMovement(m, names.get(m.detailCenterId) ?? "", href);
                    return (
                      <tr key={`${r.key}-${i}`} className="border-t border-border">
                        <td className="px-md py-sm">{r.date}</td>
                        <td className="px-md py-sm">{r.center}</td>
                        <td className="px-md py-sm">{r.source}</td>
                        <td className="px-md py-sm">
                          {r.href ? (
                            <Link href={r.href} className="underline">
                              {r.reference}
                            </Link>
                          ) : (
                            r.reference
                          )}
                        </td>
                        <td className="px-md py-sm">
                          {r.description}
                          <span className="block text-xs text-muted">{r.item}</span>
                        </td>
                        <td className="px-md py-sm text-right tabular-nums">{r.amount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </AppShell>
  );
}
