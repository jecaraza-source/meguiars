import {
  upsellAcceptanceRate,
  upsellByRule,
  upsellIncrementalRevenue,
  upsellIncrementPerOrder,
  upsellMembershipValue,
  upsellOffered,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  can,
  formatMoney,
  presentRule,
  todayIn,
  upsellCopy,
  usableCenters,
} from "@meguiars/domain";
import {
  createCatalogRepository,
  createMembershipRepository,
  createUpsellRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { UpsellRuleForm } from "@/components/upsell-forms";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Conversión de recomendaciones (tasa de aceptación e ingreso incremental) y reglas. */
export default async function UpsellPage({ searchParams }: PageProps<"/comercial/recomendaciones">) {
  const state = await requireScreen("upsell");
  const access = activeCenterAccess(state)!;
  const center = access.center;
  const params = await searchParams;
  const all = params.alcance === "todos";
  const editing = typeof params.regla === "string" ? params.regla : null;
  const saved = params.guardada === "1";
  const supabase = (await createSupabaseServerClient())!;
  const repo = createUpsellRepository(supabase);
  const centers = all ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
  const to = todayIn(center.timezone);
  const from = addDays(to, -29);
  // Las reglas son de la organización: sólo el admin corporativo las edita.
  const canManage = can(access.corporateRoles, "upsell.manage");
  const [facts, rules, catalog, plans] = await Promise.all([
    repo.metricFacts(centers, from, to),
    repo.listRules(center.organizationId),
    canManage ? createCatalogRepository(supabase).listForCenter(center.id) : Promise.resolve(null),
    canManage ? createMembershipRepository(supabase).listPlans(center.organizationId) : Promise.resolve(null),
  ]);
  const input = { facts: facts.ok ? facts.data : [] };
  const byRule = upsellByRule(input.facts);
  const orgCenters = state.access
    .filter((a) => a.center.organizationId === center.organizationId && a.center.active)
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  const rule = editing && rules.ok ? rules.data.find((r) => r.id === editing) : undefined;

  return (
    <AppShell state={state} screen="upsell" title={upsellCopy.title} description={upsellCopy.description}>
      <Card
        title={upsellCopy.metricsTitle}
        subtitle={`${upsellCopy.metricsRange} · ${all ? upsellCopy.scopeAll : center.name}`}
        actions={
          <Link
            href={all ? "/comercial/recomendaciones" : "/comercial/recomendaciones?alcance=todos"}
            className="text-sm underline"
          >
            {all ? upsellCopy.scopeCenter : upsellCopy.scopeAll}
          </Link>
        }
      >
        {!facts.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {facts.error.message}
          </p>
        ) : input.facts.length === 0 ? (
          <EmptyState title={upsellCopy.metricsEmpty} />
        ) : (
          <div className="flex flex-col gap-lg">
            <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Tasa de aceptación"
                value={`${upsellAcceptanceRate.compute(input)} %`}
                caption={`${upsellOffered.compute(input)} ofrecidas`}
              />
              <KpiCard
                label="Ingreso incremental"
                value={formatMoney(upsellIncrementalRevenue.compute(input))}
                caption="Líneas agregadas vigentes"
              />
              <KpiCard
                label="Incremento por OS"
                value={formatMoney(upsellIncrementPerOrder.compute(input))}
                caption="OS con sugerencias"
              />
              <KpiCard
                label="Membresías aceptadas"
                value={formatMoney(upsellMembershipValue.compute(input))}
                caption="Valor del plan (intención)"
              />
            </div>
            <Table
              caption="Conversión por regla"
              rows={byRule}
              rowKey={(r) => r.ruleId}
              emptyMessage={upsellCopy.metricsEmpty}
              columns={[
                { key: "rule", header: "Regla", value: (r) => r.ruleName },
                { key: "offered", header: "Ofrecidas", value: (r) => String(r.offered), align: "end" },
                { key: "accepted", header: "Aceptadas", value: (r) => String(r.accepted), align: "end" },
                { key: "rejected", header: "Rechazadas", value: (r) => String(r.rejected), align: "end" },
                { key: "rate", header: "Aceptación", value: (r) => `${r.acceptanceRate} %`, align: "end" },
                {
                  key: "value",
                  header: "Ingreso",
                  value: (r) =>
                    formatMoney(r.targetKind === "membresia" ? r.membershipValue : r.incrementalRevenue),
                  align: "end",
                },
              ]}
            />
          </div>
        )}
      </Card>

      <Card title={upsellCopy.rulesTitle}>
        {!rules.ok ? (
          <p role="alert" className="text-sm">
            {rules.error.message}
          </p>
        ) : rules.data.length === 0 ? (
          <EmptyState title={upsellCopy.rulesEmpty} />
        ) : (
          <ul className="flex flex-col gap-sm" aria-label={upsellCopy.rulesTitle}>
            {rules.data.map((r) => {
              const v = presentRule(r, to);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-xs border-b border-border pb-sm"
                  data-testid="upsell-rule"
                >
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <strong>{v.name}</strong>
                    <Badge label={v.state} tone={v.stateTone} />
                  </div>
                  <span className="text-sm">
                    {v.flow} · {v.stage} · prioridad {v.priority}
                  </span>
                  <span className="text-sm text-muted">{r.pitch}</span>
                  {canManage ? (
                    <Link href={`/comercial/recomendaciones?regla=${r.id}`} className="text-sm underline">
                      {upsellCopy.editRule}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canManage ? (
        <Card title={rule ? `${upsellCopy.editRule}: ${rule.name}` : upsellCopy.newRule}>
          {saved ? (
            <p role="status" className="mg-tone mb-md rounded-md border p-md text-sm" data-tone="success">
              {upsellCopy.saved}
            </p>
          ) : null}
          {rule ? (
            <Link href="/comercial/recomendaciones" className="text-sm underline">
              {upsellCopy.newRule}
            </Link>
          ) : null}
          <UpsellRuleForm
            key={rule?.id ?? "new"}
            rule={rule}
            services={catalog?.ok ? catalog.data : []}
            plans={plans?.ok ? plans.data : []}
            centers={orgCenters}
            today={to}
          />
        </Card>
      ) : null}
    </AppShell>
  );
}
