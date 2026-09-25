import {
  activeCenterAccess,
  canInActiveCenter,
  clientErrorMessage,
  clientsCopy,
  presentSearchResult,
} from "@meguiars/domain";
import { createClientRepository } from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClientsPage({ searchParams }: PageProps<"/clientes">) {
  const state = await requireScreen("clients");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const linkError = typeof params.error === "string" ? params.error : undefined;
  const canWrite = canInActiveCenter(state, "clients.write");

  const client = (await createSupabaseServerClient())!;
  const result = q ? await createClientRepository(client).search(center.id, q) : null;
  const rows = result?.ok ? result.data.map((r) => presentSearchResult(r, center.timezone)) : [];

  return (
    <AppShell state={state} screen="clients" title={clientsCopy.title} description={clientsCopy.description}>
      <Card
        actions={
          canWrite ? (
            <ButtonLink href="/clientes/nuevo" label={clientsCopy.newClient} variant="primary" />
          ) : null
        }
      >
        <form role="search" className="flex flex-col gap-sm md:flex-row md:items-end" action="/clientes">
          <div className="flex-1">
            <Input
              name="q"
              type="search"
              label={clientsCopy.searchLabel}
              hint={clientsCopy.searchHint}
              defaultValue={q}
              autoFocus
            />
          </div>
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            {clientsCopy.searchSubmit}
          </button>
        </form>
      </Card>
      {linkError ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {linkError}
        </p>
      ) : null}
      {!q ? (
        <EmptyState title={clientsCopy.searchPromptTitle} message={clientsCopy.searchPromptMessage} />
      ) : result && !result.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {result.error.kind === "validation" ? clientsCopy.searchHint : clientErrorMessage(result.error)}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState title={clientsCopy.searchEmptyTitle} message={clientsCopy.searchEmptyMessage} />
      ) : (
        <Table
          caption={`Resultados para ${q}`}
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/clientes/${r.id}`}
          emptyMessage={clientsCopy.searchEmptyTitle}
          columns={[
            { key: "name", header: "Cliente", value: (r) => r.name },
            { key: "phone", header: "Teléfono", value: (r) => r.phone },
            { key: "plates", header: "Placas", value: (r) => r.plates },
            { key: "home", header: "Centro habitual", value: (r) => r.home },
            { key: "last", header: clientsCopy.lastVisitLabel, value: (r) => r.lastVisit },
            { key: "match", header: "Coincide por", value: (r) => r.match },
          ]}
        />
      )}
    </AppShell>
  );
}
