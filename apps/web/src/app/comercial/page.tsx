import { membershipKpis } from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  canInActiveCenter,
  crmCopy,
  membershipKpiCards,
  membershipsCopy,
  sectionCopy,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Resumen comercial: KPIs de membresías del centro activo o consolidados de todos mis centros. */
export default async function Page({ searchParams }: PageProps<"/comercial">) {
  const state = await requireScreen("comercial");
  const center = activeCenterAccess(state)!.center;
  const all = (await searchParams).alcance === "todos";
  const centers = all ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
  const to = todayIn(center.timezone);
  const from = addDays(to, -29);
  const facts = await createMembershipRepository((await createSupabaseServerClient())!).metricFacts(
    centers,
    from,
    to,
  );
  const copy = sectionCopy.comercial;

  return (
    <AppShell state={state} screen="comercial" title={copy.title} description={copy.description}>
      <Card
        title={membershipsCopy.kpisTitle}
        subtitle={`${membershipsCopy.kpisRange} · ${all ? membershipsCopy.scopeAll : center.name}`}
        actions={
          <div className="flex flex-wrap gap-sm">
            <Link href={all ? "/comercial" : "/comercial?alcance=todos"} className="text-sm underline">
              {all ? membershipsCopy.scopeCenter : membershipsCopy.scopeAll}
            </Link>
            {canInActiveCenter(state, "memberships.read") ? (
              <ButtonLink href="/comercial/membresias" label={membershipsCopy.title} />
            ) : null}
            {canInActiveCenter(state, "crm.read") ? (
              <>
                <ButtonLink href="/comercial/clientes" label={crmCopy.customersTitle} />
                <ButtonLink href="/comercial/seguimientos" label={crmCopy.tasksTitle} />
              </>
            ) : null}
          </div>
        }
      >
        {!facts.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {facts.error.message}
          </p>
        ) : facts.data.length === 0 ? (
          <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} />
        ) : (
          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
            {membershipKpiCards(membershipKpis({ facts: facts.data, from, to })).map((k) => (
              <KpiCard key={k.label} label={k.label} value={k.value} caption={k.caption} />
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
