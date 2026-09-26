import {
  activeCenterAccess,
  b2bCopy,
  b2bErrorMessage,
  B2B_ACCOUNT_STATUS_LABELS,
  B2B_ACCOUNT_STATUSES,
  canInActiveCenter,
  presentAccountListItem,
  todayIn,
} from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import { b2bAccountFilterSchema } from "@meguiars/validation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cuentas B2B visibles desde los centros del usuario (centro gestor o habilitado). */
export default async function B2bAccountsPage({ searchParams }: PageProps<"/comercial/b2b">) {
  const state = await requireScreen("b2bAccounts");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const parsed = b2bAccountFilterSchema.safeParse({ status: param("estatus"), query: param("q") });
  const filter = parsed.success ? parsed.data : {};
  const result = await createB2bRepository((await createSupabaseServerClient())!).listAccounts(
    todayIn(center.timezone),
    filter,
  );

  return (
    <AppShell state={state} screen="b2bAccounts" title={b2bCopy.title} description={b2bCopy.description}>
      <Card
        actions={
          <div className="flex flex-wrap gap-sm">
            <ButtonLink href="/comercial/b2b/rentabilidad" label={b2bCopy.profitabilityTitle} />
            {canInActiveCenter(state, "b2b.write") ? (
              <ButtonLink href="/comercial/b2b/nueva" label={b2bCopy.newAccount} variant="primary" />
            ) : null}
          </div>
        }
      >
        <form className="grid gap-sm md:grid-cols-3 md:items-end" action="/comercial/b2b">
          <Input name="q" type="search" label={b2bCopy.search} defaultValue={filter.query ?? ""} />
          <Select
            name="estatus"
            label={b2bCopy.statusFilter}
            options={[
              { value: "", label: b2bCopy.allStatuses },
              ...B2B_ACCOUNT_STATUSES.map((s) => ({ value: s, label: B2B_ACCOUNT_STATUS_LABELS[s] })),
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
          {b2bErrorMessage(result.error)}
        </p>
      ) : result.data.length === 0 ? (
        <EmptyState title={b2bCopy.empty} />
      ) : (
        <Table
          caption={b2bCopy.title}
          rows={result.data.map(presentAccountListItem)}
          rowKey={(a) => a.id}
          rowHref={(a) => `/comercial/b2b/${a.id}`}
          emptyMessage={b2bCopy.empty}
          columns={[
            { key: "name", header: "Cuenta", value: (a) => a.name },
            { key: "rfc", header: "RFC", value: (a) => a.rfc },
            { key: "status", header: b2bCopy.status, value: (a) => a.status },
            { key: "home", header: b2bCopy.homeCenter, value: (a) => a.homeCenter },
            { key: "agreement", header: "Convenio", value: (a) => a.agreement },
          ]}
        />
      )}
    </AppShell>
  );
}
