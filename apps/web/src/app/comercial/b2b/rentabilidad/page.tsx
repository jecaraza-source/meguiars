import { b2bProfitability } from "@meguiars/analytics";
import { activeCenterAccess, addDays, b2bCopy, formatMoney, todayIn, usableCenters } from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Rentabilidad B2B por cuenta y centro (últimos 30 días), del centro activo o consolidada. */
export default async function B2bProfitabilityPage({
  searchParams,
}: PageProps<"/comercial/b2b/rentabilidad">) {
  const state = await requireScreen("b2bProfitability");
  const center = activeCenterAccess(state)!.center;
  const all = (await searchParams).alcance === "todos";
  const centers = all ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
  const to = todayIn(center.timezone);
  const from = addDays(to, -29);
  const facts = await createB2bRepository((await createSupabaseServerClient())!).profitabilityFacts(
    centers,
    from,
    to,
  );
  const names = new Map(state.access.map((a) => [a.center.id, a.center.name]));
  const report = facts.ok ? b2bProfitability(facts.data) : null;

  return (
    <AppShell
      state={state}
      screen="b2bProfitability"
      title={b2bCopy.profitabilityTitle}
      description={b2bCopy.profitabilityDescription}
    >
      <Card
        subtitle={`${b2bCopy.range} · ${all ? b2bCopy.scopeAll : center.name}`}
        actions={
          <Link
            href={all ? "/comercial/b2b/rentabilidad" : "/comercial/b2b/rentabilidad?alcance=todos"}
            className="text-sm underline"
          >
            {all ? b2bCopy.scopeCenter : b2bCopy.scopeAll}
          </Link>
        }
      >
        {!facts.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {facts.error.message}
          </p>
        ) : report!.rows.length === 0 ? (
          <EmptyState title={b2bCopy.profitabilityEmpty} />
        ) : (
          <div className="flex flex-col gap-lg">
            <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Ingreso B2B"
                value={formatMoney(report!.total.income)}
                caption="OS terminadas + cuotas"
              />
              <KpiCard
                label="Costo directo"
                value={formatMoney(report!.total.cost)}
                caption="Costo congelado de las OS"
              />
              <KpiCard
                label="Margen"
                value={formatMoney(report!.total.margin)}
                caption={`${report!.total.marginPercent} %`}
              />
              <KpiCard label="OS" value={String(report!.total.orders)} caption="Terminadas o entregadas" />
            </div>
            <Table
              caption={b2bCopy.profitabilityTitle}
              rows={report!.rows}
              rowKey={(r) => r.key}
              rowHref={(r) => `/comercial/b2b/${r.accountId}`}
              emptyMessage={b2bCopy.profitabilityEmpty}
              columns={[
                { key: "account", header: "Cuenta", value: (r) => r.accountName },
                {
                  key: "center",
                  header: "Centro",
                  value: (r) =>
                    r.detailCenterId ? (names.get(r.detailCenterId) ?? "Otro centro") : "Consolidado",
                },
                { key: "orders", header: "OS", value: (r) => String(r.orders), align: "end" },
                { key: "income", header: "Ingreso", value: (r) => formatMoney(r.income), align: "end" },
                { key: "cost", header: "Costo", value: (r) => formatMoney(r.cost), align: "end" },
                {
                  key: "margin",
                  header: "Margen",
                  value: (r) => `${formatMoney(r.margin)} · ${r.marginPercent} %`,
                  align: "end",
                },
              ]}
            />
          </div>
        )}
      </Card>
    </AppShell>
  );
}
