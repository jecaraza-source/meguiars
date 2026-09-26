import {
  activeCenterAccess,
  b2bCopy,
  canInCenter,
  formatMoney,
  newRequestId,
  presentAgreement,
  presentPriceRule,
  resolveB2bPrice,
  todayIn,
} from "@meguiars/domain";
import { createB2bRepository, createCatalogRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AgreementForm, PriceRuleForm, RuleToggle } from "@/components/b2b-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Convenio: vigencia, centros, condición de pago y tarifas (con vista previa del precio convenido). */
export default async function B2bAgreementPage({
  params,
  searchParams,
}: PageProps<"/comercial/b2b/convenios/[id]">) {
  const state = await requireScreen("b2bAgreementDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const created = (await searchParams).nuevo === "1";
  const supabase = (await createSupabaseServerClient())!;
  const [result, catalog] = await Promise.all([
    createB2bRepository(supabase).getAgreement(id),
    createCatalogRepository(supabase).listForCenter(center.id),
  ]);
  if (!result.ok) {
    return (
      <AppShell state={state} screen="b2bAgreementDetail" title={b2bCopy.agreementsTitle}>
        <EmptyState
          title={result.error.message}
          action={<ButtonLink href="/comercial/b2b" label={b2bCopy.title} />}
        />
      </AppShell>
    );
  }
  const { agreement: g, accountName, rules } = result.data;
  const today = todayIn(center.timezone);
  const centerNames = new Map(state.access.map((a) => [a.center.id, a.center.name]));
  const view = presentAgreement(g, today, (cid) => centerNames.get(cid) ?? "Otro centro");
  const canWrite = result.data.accountHomeCenterId
    ? canInCenter(state, result.data.accountHomeCenterId, "b2b.write")
    : false;
  const services = catalog.ok ? catalog.data : [];
  const orgCenters = state.access
    .filter((a) => a.center.active)
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  // Precio convenido al abrir la primera OS del mes (sin escalones ni unidades consumidas).
  const preview = services.map((s) => {
    const p = resolveB2bPrice(rules, {
      serviceId: s.id,
      listPrice: s.price,
      quantity: 1,
      monthlyVolume: 1,
      usedUnits: 0,
      includedUnits: g.includedUnits,
    });
    return {
      id: s.id,
      name: s.name,
      list: formatMoney(s.price),
      agreed: p.ruleId ? formatMoney(p.price) : "Lista",
    };
  });

  return (
    <AppShell
      state={state}
      screen="b2bAgreementDetail"
      title={`${view.name} · ${accountName}`}
      description={view.model}
    >
      <div className="flex flex-wrap items-center gap-sm">
        <Link href={`/comercial/b2b/${g.accountId}`} className="text-sm underline">
          ← {accountName}
        </Link>
        <Badge label={view.state} tone={view.stateTone} />
      </div>
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {b2bCopy.saved}
        </p>
      ) : null}
      {!view.applies ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
          {b2bCopy.agreementExpiredHint}
        </p>
      ) : null}

      <Card title={b2bCopy.rulesTitle} subtitle={b2bCopy.rulesHint}>
        {rules.length === 0 ? <EmptyState title={b2bCopy.rulesEmpty} /> : null}
        <ul className="flex flex-col gap-sm" aria-label={b2bCopy.rulesTitle}>
          {rules.map((r) => {
            const v = presentPriceRule(r);
            return (
              <li
                key={r.id}
                className="flex flex-col gap-xs border-b border-border pb-sm"
                data-testid="b2b-rule"
              >
                <span>
                  <strong>{v.service}</strong> · {v.kind} · {v.value} · {v.volume} · {v.status}
                </span>
                {canWrite ? <RuleToggle rule={r} /> : null}
              </li>
            );
          })}
        </ul>
        {canWrite ? (
          <div className="mt-md">
            <PriceRuleForm agreementId={g.id} services={services} model={g.billingModel} />
          </div>
        ) : null}
      </Card>

      <Card title={b2bCopy.pricePreview} subtitle="Primera OS del mes, sin unidades consumidas">
        <Table
          caption={b2bCopy.pricePreview}
          rows={preview}
          rowKey={(p) => p.id}
          emptyMessage="Sin servicios en el catálogo del centro."
          columns={[
            { key: "name", header: "Servicio", value: (p) => p.name },
            { key: "list", header: b2bCopy.listPrice, value: (p) => p.list, align: "end" },
            { key: "agreed", header: b2bCopy.convenio, value: (p) => p.agreed, align: "end" },
          ]}
        />
      </Card>

      <Card title="Condiciones">
        {canWrite ? (
          <AgreementForm
            accountId={g.accountId}
            requestId={newRequestId()}
            agreement={g}
            centers={orgCenters}
            today={today}
          />
        ) : (
          <dl className="grid grid-cols-2 gap-xs text-sm">
            <dt className="text-muted">Vigencia</dt>
            <dd>{view.validity}</dd>
            <dt className="text-muted">{b2bCopy.vehicleRule}</dt>
            <dd>{view.vehicles}</dd>
            <dt className="text-muted">Pago</dt>
            <dd>{view.terms}</dd>
            <dt className="text-muted">Cuota</dt>
            <dd>{view.fee}</dd>
            <dt className="text-muted">{b2bCopy.centers}</dt>
            <dd>{view.centers}</dd>
          </dl>
        )}
      </Card>
    </AppShell>
  );
}
