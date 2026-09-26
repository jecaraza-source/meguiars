import {
  activeCenterAccess,
  canManageServices,
  membershipsCopy,
  presentPlan,
  todayIn,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PlanForm } from "@/components/membership-forms";
import { Card, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Catálogo de planes de la organización; el admin corporativo los crea. */
export default async function PlansPage() {
  const state = await requireScreen("membershipPlans");
  const center = activeCenterAccess(state)!.center;
  const manage = canManageServices(state);
  const result = await createMembershipRepository((await createSupabaseServerClient())!).listPlans(
    center.organizationId,
    { includeInactive: manage },
  );
  return (
    <AppShell
      state={state}
      screen="membershipPlans"
      title={membershipsCopy.plansTitle}
      description={membershipsCopy.plansDescription}
    >
      <Link href="/comercial/membresias" className="text-sm underline">
        ← {membershipsCopy.title}
      </Link>
      <Card title={membershipsCopy.plansTitle}>
        {!result.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {result.error.message}
          </p>
        ) : (
          <Table
            caption={membershipsCopy.plansTitle}
            rows={result.data.map(presentPlan)}
            rowKey={(p) => p.id}
            rowHref={(p) => `/comercial/planes/${p.id}`}
            emptyMessage="Aún no hay planes."
            columns={[
              { key: "name", header: membershipsCopy.planName, value: (p) => p.name },
              { key: "price", header: membershipsCopy.planPrice, value: (p) => p.price },
              { key: "benefits", header: membershipsCopy.benefitsTitle, value: (p) => p.benefits },
              { key: "scope", header: membershipsCopy.planScope, value: (p) => p.scope },
              { key: "status", header: "Estatus", value: (p) => p.status },
            ]}
          />
        )}
      </Card>
      {manage ? (
        <Card title={membershipsCopy.newPlan}>
          <PlanForm today={todayIn(center.timezone)} />
        </Card>
      ) : null}
    </AppShell>
  );
}
