import {
  activeCenterAccess,
  agendaCopy,
  clientErrorMessage,
  newRequestId,
  ordersCopy,
  presentSearchResult,
} from "@meguiars/domain";
import { createAgendaRepository, createCatalogRepository, createClientRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewOrderForm } from "@/components/order-forms";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** OS walk-in (sin cita): elegir cliente y después vehículo, canal y líneas. */
export default async function NewOrderPage({ searchParams }: PageProps<"/ordenes/nueva">) {
  const state = await requireScreen("orderNew");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const clientId = param("cliente");
  const q = param("q");
  const supabase = (await createSupabaseServerClient())!;

  if (!clientId) {
    const results = q ? await createClientRepository(supabase).search(center.id, q) : null;
    return (
      <AppShell
        state={state}
        screen="orderNew"
        title={ordersCopy.newTitle}
        description={ordersCopy.newDescription}
      >
        <Card>
          <form className="flex flex-col gap-sm md:flex-row md:items-end" action="/ordenes/nueva">
            <div className="flex-1">
              <Input name="q" type="search" label={agendaCopy.clientSearch} defaultValue={q} autoFocus />
            </div>
            <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
              Buscar
            </button>
          </form>
          <Link href="/clientes/nuevo" className="text-sm underline">
            {agendaCopy.noClient}
          </Link>
        </Card>
        {results && !results.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {clientErrorMessage(results.error)}
          </p>
        ) : results?.ok && results.data.length === 0 ? (
          <EmptyState title="Sin resultados" message={agendaCopy.noClient} />
        ) : results?.ok ? (
          <Table
            caption="Clientes"
            rows={results.data.map((r) => presentSearchResult(r, center.timezone))}
            rowKey={(r) => r.id}
            rowHref={(r) => `/ordenes/nueva?cliente=${r.id}`}
            emptyMessage="Sin resultados"
            columns={[
              { key: "name", header: "Cliente", value: (r) => r.name },
              { key: "phone", header: "Teléfono", value: (r) => r.phone },
              { key: "plates", header: "Placas", value: (r) => r.plates },
            ]}
          />
        ) : null}
      </AppShell>
    );
  }

  const agenda = createAgendaRepository(supabase);
  const [client, catalog, bays, technicians] = await Promise.all([
    createClientRepository(supabase).get(clientId),
    createCatalogRepository(supabase).listForCenter(center.id),
    agenda.listBays(center.id),
    agenda.listTechnicians(center.id),
  ]);
  if (!client.ok) {
    return (
      <AppShell state={state} screen="orderNew" title={ordersCopy.newTitle}>
        <EmptyState title={clientErrorMessage(client.error)} />
      </AppShell>
    );
  }
  return (
    <AppShell state={state} screen="orderNew" title={ordersCopy.newTitle} description={client.data.fullName}>
      <Link href="/ordenes/nueva" className="text-sm underline">
        {agendaCopy.changeClient}
      </Link>
      <Card>
        <NewOrderForm
          requestId={newRequestId()}
          clientId={client.data.id}
          vehicles={client.data.vehicles}
          services={catalog.ok ? catalog.data : []}
          bays={bays.ok ? bays.data : []}
          technicians={technicians.ok ? technicians.data : []}
        />
      </Card>
    </AppShell>
  );
}
