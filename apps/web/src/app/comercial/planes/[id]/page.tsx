import {
  activeCenterAccess,
  canManageServices,
  formatDateOnly,
  membershipsCopy,
  presentPlan,
  todayIn,
} from "@meguiars/domain";
import { createCatalogRepository, createMembershipRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BenefitsEditor, PlanForm } from "@/components/membership-forms";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PlanPage({ params, searchParams }: PageProps<"/comercial/planes/[id]">) {
  const state = await requireScreen("membershipPlanDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const created = (await searchParams).nuevo === "1";
  const supabase = (await createSupabaseServerClient())!;
  const manage = canManageServices(state);
  const [plan, catalog] = await Promise.all([
    createMembershipRepository(supabase).getPlan(id),
    manage ? createCatalogRepository(supabase).listForCenter(center.id) : null,
  ]);
  if (!plan.ok) {
    return (
      <AppShell state={state} screen="membershipPlanDetail" title={membershipsCopy.plansTitle}>
        <EmptyState
          title="El plan no existe."
          action={<ButtonLink href="/comercial/planes" label={membershipsCopy.plansTitle} />}
        />
      </AppShell>
    );
  }
  const view = presentPlan(plan.data);
  return (
    <AppShell
      state={state}
      screen="membershipPlanDetail"
      title={view.name}
      description={plan.data.description ?? membershipsCopy.plansDescription}
    >
      <Link href="/comercial/planes" className="text-sm underline">
        ← {membershipsCopy.plansTitle}
      </Link>
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {membershipsCopy.planCreated}
        </p>
      ) : null}
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={membershipsCopy.planPrice} value={view.price} caption={view.period} />
        <KpiCard label={membershipsCopy.planScope} value={view.scope} />
        <KpiCard label={membershipsCopy.planNotice} value={String(plan.data.renewalNoticeDays)} />
        <KpiCard
          label="Vigencia de venta"
          value={formatDateOnly(plan.data.availableFrom)}
          caption={
            plan.data.availableUntil ? `hasta ${formatDateOnly(plan.data.availableUntil)}` : view.status
          }
        />
      </div>
      <Card title={membershipsCopy.benefitsTitle}>
        {manage ? (
          <BenefitsEditor plan={plan.data} services={catalog?.ok ? catalog.data : []} />
        ) : (
          <Table
            caption={membershipsCopy.benefitsTitle}
            rows={plan.data.benefits}
            rowKey={(b) => b.id}
            emptyMessage={membershipsCopy.balanceEmpty}
            columns={[
              {
                key: "service",
                header: membershipsCopy.benefitService,
                value: (b) => `${b.serviceName} · ${b.serviceCode}`,
              },
              {
                key: "qty",
                header: membershipsCopy.benefitQuantity,
                value: (b) => String(b.quantityPerPeriod),
                align: "end",
              },
            ]}
          />
        )}
      </Card>
      {plan.data.restrictions ? (
        <Card title={membershipsCopy.planRestrictions}>
          <p className="text-sm">{plan.data.restrictions}</p>
        </Card>
      ) : null}
      {manage ? (
        <Card title={membershipsCopy.planSave}>
          <PlanForm plan={plan.data} today={todayIn(center.timezone)} />
        </Card>
      ) : null}
    </AppShell>
  );
}
