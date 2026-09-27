import {
  activeCenterAccess,
  activeRoles,
  newRequestId,
  pipelineCopy,
  todayIn,
  writableOpportunityKinds,
  type OpportunityKind,
} from "@meguiars/domain";
import { createB2bRepository, createCrmRepository, createPipelineRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewOpportunityForm } from "@/components/pipeline-forms";
import { Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Alta de oportunidad. `?tipo=b2b&cuenta=<id>` o `?tipo=b2c_premium&cliente=<id>` precargan el contacto. */
export default async function NewOpportunityPage({ searchParams }: PageProps<"/comercial/pipeline/nueva">) {
  const state = await requireScreen("opportunityNew");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const kinds = writableOpportunityKinds(activeRoles(state));
  const defaultKind = (kinds.find((k) => k === param("tipo")) ??
    kinds[0] ??
    "b2c_premium") as OpportunityKind;
  const supabase = (await createSupabaseServerClient())!;
  const pipeline = createPipelineRepository(supabase);
  const b2b = kinds.includes("b2b") ? createB2bRepository(supabase) : null;
  const today = todayIn(center.timezone);
  const [stages, ownersB2b, ownersB2c, accounts, companies, customers] = await Promise.all([
    pipeline.stages(center.organizationId),
    pipeline.owners(center.id, "b2b"),
    pipeline.owners(center.id, "b2c_premium"),
    b2b ? b2b.listAccounts(today, { status: "activa" }) : Promise.resolve(null),
    b2b ? b2b.companiesWithoutAccount() : Promise.resolve(null),
    kinds.includes("b2c_premium")
      ? createCrmRepository(supabase).listCustomers([center.id])
      : Promise.resolve(null),
  ]);
  const clients = customers?.ok
    ? customers.data
        .filter((c) => c.kind === "person")
        .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
        .map((c) => ({ value: c.clientId, label: c.fullName }))
    : [];
  return (
    <AppShell
      state={state}
      screen="opportunityNew"
      title={pipelineCopy.newOpportunity}
      description={pipelineCopy.description}
    >
      <Link href="/comercial/pipeline" className="text-sm underline">
        ← {pipelineCopy.title}
      </Link>
      <Card>
        {!stages.ok ? (
          <p role="alert" className="text-sm">
            {stages.error.message}
          </p>
        ) : (
          <NewOpportunityForm
            requestId={newRequestId()}
            kinds={kinds}
            defaultKind={defaultKind}
            stages={stages.data}
            owners={{
              b2b: ownersB2b.ok ? ownersB2b.data : [],
              b2c_premium: ownersB2c.ok ? ownersB2c.data : [],
            }}
            defaultOwnerId={state.user.id}
            accounts={accounts?.ok ? accounts.data.map((a) => ({ value: a.id, label: a.name })) : []}
            companies={companies?.ok ? companies.data.map((c) => ({ value: c.id, label: c.name })) : []}
            clients={clients}
            defaults={{ clientId: param("cliente") || undefined, accountId: param("cuenta") || undefined }}
            today={today}
          />
        )}
      </Card>
    </AppShell>
  );
}
