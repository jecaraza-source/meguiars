import {
  activeCenterAccess,
  agendaCopy,
  clientErrorMessage,
  membershipsCopy,
  newRequestId,
  presentSearchResult,
  todayIn,
} from "@meguiars/domain";
import { createClientRepository, createMembershipRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewMembershipForm } from "@/components/membership-forms";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Alta de membresía: elegir cliente y después vehículo y plan. */
export default async function NewMembershipPage({ searchParams }: PageProps<"/comercial/membresias/nueva">) {
  const state = await requireScreen("membershipNew");
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
        screen="membershipNew"
        title={membershipsCopy.newTitle}
        description={membershipsCopy.newDescription}
      >
        <Card>
          <form
            className="flex flex-col gap-sm md:flex-row md:items-end"
            action="/comercial/membresias/nueva"
          >
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
            rowHref={(r) => `/comercial/membresias/nueva?cliente=${r.id}`}
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

  const [client, plans] = await Promise.all([
    createClientRepository(supabase).get(clientId),
    createMembershipRepository(supabase).listPlans(center.organizationId),
  ]);
  if (!client.ok) {
    return (
      <AppShell state={state} screen="membershipNew" title={membershipsCopy.newTitle}>
        <EmptyState title={clientErrorMessage(client.error)} />
      </AppShell>
    );
  }
  const today = todayIn(center.timezone);
  const available = plans.ok
    ? plans.data.filter(
        (p) =>
          p.benefits.length > 0 &&
          p.availableFrom <= today &&
          (!p.availableUntil || p.availableUntil >= today),
      )
    : [];
  return (
    <AppShell
      state={state}
      screen="membershipNew"
      title={membershipsCopy.newTitle}
      description={client.data.fullName}
    >
      <Link href="/comercial/membresias/nueva" className="text-sm underline">
        {agendaCopy.changeClient}
      </Link>
      <Card>
        {!plans.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {plans.error.message}
          </p>
        ) : available.length === 0 ? (
          <EmptyState title="No hay planes disponibles para venta" />
        ) : (
          <NewMembershipForm
            requestId={newRequestId()}
            clientId={client.data.id}
            vehicles={client.data.vehicles}
            plans={available}
            today={today}
          />
        )}
      </Card>
    </AppShell>
  );
}
