import {
  activeCenterAccess,
  agendaCopy,
  canInActiveCenter,
  clientErrorMessage,
  newRequestId,
  presentSearchResult,
  todayIn,
} from "@meguiars/domain";
import { createAgendaRepository, createCatalogRepository, createClientRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppointmentForm } from "@/components/agenda-forms";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewAppointmentPage({ searchParams }: PageProps<"/agenda/nueva">) {
  const state = await requireScreen("appointmentNew");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const walkIn = param("walkin") === "1";
  const clientId = param("cliente");
  const q = param("q");
  const day = param("dia") || todayIn(center.timezone);
  const keep = `${walkIn ? "&walkin=1" : ""}&dia=${day}`;
  const supabase = (await createSupabaseServerClient())!;
  const title = walkIn ? agendaCopy.walkInTitle : agendaCopy.newTitle;

  if (!clientId) {
    // Paso 1: elegir cliente (misma búsqueda que Clientes y vehículos).
    const results = q ? await createClientRepository(supabase).search(center.id, q) : null;
    return (
      <AppShell state={state} screen="appointmentNew" title={title} description={agendaCopy.newDescription}>
        <Card>
          <form className="flex flex-col gap-sm md:flex-row md:items-end" action="/agenda/nueva">
            {walkIn ? <input type="hidden" name="walkin" value="1" /> : null}
            <input type="hidden" name="dia" value={day} />
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
            rowHref={(r) => `/agenda/nueva?cliente=${r.id}${keep}`}
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

  // Paso 2: datos de la cita con el cliente elegido (sin recapturarlo).
  const [client, catalog, bays, technicians] = await Promise.all([
    createClientRepository(supabase).get(clientId),
    createCatalogRepository(supabase).listForCenter(center.id),
    createAgendaRepository(supabase).listBays(center.id),
    createAgendaRepository(supabase).listTechnicians(center.id),
  ]);
  if (!client.ok) {
    return (
      <AppShell state={state} screen="appointmentNew" title={title}>
        <EmptyState title={clientErrorMessage(client.error)} />
      </AppShell>
    );
  }
  return (
    <AppShell state={state} screen="appointmentNew" title={title} description={client.data.fullName}>
      <Link href={`/agenda/nueva?${walkIn ? "walkin=1&" : ""}dia=${day}`} className="text-sm underline">
        {agendaCopy.changeClient}
      </Link>
      <Card>
        <AppointmentForm
          requestId={newRequestId()}
          clientId={client.data.id}
          vehicles={client.data.vehicles}
          walkIn={walkIn}
          defaultDate={day}
          canOverride={canInActiveCenter(state, "agenda.manage")}
          services={catalog.ok ? catalog.data : []}
          bays={bays.ok ? bays.data : []}
          technicians={technicians.ok ? technicians.data : []}
        />
      </Card>
    </AppShell>
  );
}
