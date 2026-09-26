import {
  activeCenterAccess,
  canInActiveCenter,
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUSES,
  membershipErrorMessage,
  membershipsCopy,
  presentMembershipListItem,
  todayIn,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import { membershipFilterSchema } from "@meguiars/validation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MembershipsPage({ searchParams }: PageProps<"/comercial/membresias">) {
  const state = await requireScreen("memberships");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const parsed = membershipFilterSchema.safeParse({ status: param("estado"), query: param("q") });
  const filter = parsed.success ? parsed.data : {};
  const result = await createMembershipRepository((await createSupabaseServerClient())!).list(
    center.id,
    filter,
  );
  const today = todayIn(center.timezone);

  return (
    <AppShell
      state={state}
      screen="memberships"
      title={`${membershipsCopy.title} · ${center.name}`}
      description={membershipsCopy.description}
    >
      <Card
        actions={
          <div className="flex flex-wrap gap-sm">
            <ButtonLink href="/comercial/planes" label={membershipsCopy.plansOpen} />
            {canInActiveCenter(state, "memberships.write") ? (
              <ButtonLink
                href="/comercial/membresias/nueva"
                label={membershipsCopy.newMembership}
                variant="primary"
              />
            ) : null}
          </div>
        }
      >
        <form className="grid gap-sm md:grid-cols-3 md:items-end" action="/comercial/membresias">
          <Input name="q" type="search" label={membershipsCopy.search} defaultValue={filter.query ?? ""} />
          <Select
            name="estado"
            label={membershipsCopy.statusFilter}
            options={[
              { value: "", label: membershipsCopy.allStatuses },
              ...MEMBERSHIP_STATUSES.map((s) => ({ value: s, label: MEMBERSHIP_STATUS_LABELS[s] })),
            ]}
            defaultValue={filter.status ?? ""}
          />
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            Filtrar
          </button>
        </form>
      </Card>
      {!result.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {membershipErrorMessage(result.error)}
        </p>
      ) : result.data.length === 0 ? (
        <EmptyState title={membershipsCopy.empty} />
      ) : (
        <Table
          caption={membershipsCopy.title}
          rows={result.data.map((m) => presentMembershipListItem(m, today))}
          rowKey={(m) => m.id}
          rowHref={(m) => `/comercial/membresias/${m.id}`}
          emptyMessage={membershipsCopy.empty}
          columns={[
            { key: "number", header: membershipsCopy.number, value: (m) => m.number },
            { key: "client", header: membershipsCopy.client, value: (m) => `${m.client} · ${m.vehicle}` },
            { key: "plan", header: membershipsCopy.plan, value: (m) => m.plan },
            { key: "status", header: membershipsCopy.statusFilter, value: (m) => m.label },
            {
              key: "renewal",
              header: membershipsCopy.nextRenewal,
              value: (m) => `${m.endsOn} · ${m.renewal}`,
            },
            { key: "price", header: membershipsCopy.price, value: (m) => m.price, align: "end" },
          ]}
        />
      )}
    </AppShell>
  );
}
