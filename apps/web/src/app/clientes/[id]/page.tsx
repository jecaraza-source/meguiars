import {
  activeCenterAccess,
  can,
  canInActiveCenter,
  clientErrorMessage,
  clientsCopy,
  presentClientDetail,
  presentHistoryEntry,
  vehicleLabel,
} from "@meguiars/domain";
import { createClientRepository } from "@meguiars/supabase";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/app-shell";
import { AddVehicleForm, DeactivateVehicleForm, EditClientForm } from "@/components/client-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClientDetailPage({ params, searchParams }: PageProps<"/clientes/[id]">) {
  const state = await requireScreen("clientDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const created = (await searchParams).nuevo === "1";
  const repo = createClientRepository((await createSupabaseServerClient())!);
  const [detail, history] = await Promise.all([repo.get(id), repo.history(id)]);

  if (!detail.ok) {
    return (
      <AppShell state={state} screen="clientDetail" title={clientsCopy.detailTitle}>
        <EmptyState
          title={detail.error.kind === "not_found" ? clientsCopy.notFound : clientErrorMessage(detail.error)}
          action={<ButtonLink href="/clientes" label={clientsCopy.title} />}
        />
      </AppShell>
    );
  }

  const client = detail.data;
  const view = presentClientDetail(client, state.access, center.timezone);
  // Editar requiere clients.write en el centro activo; la base exige además que el cliente esté vinculado a un centro propio.
  const canWrite = canInActiveCenter(state, "clients.write");
  // Centro habitual: los centros de la organización donde el usuario puede registrar clientes (más el actual).
  const writableCenters = state.access
    .filter((a) => a.center.active && a.center.organizationId === client.organizationId)
    .filter((a) => can([...a.roles, ...a.corporateRoles], "clients.write"))
    .map((a) => ({ value: a.center.id, label: a.center.name }));
  if (!writableCenters.some((c) => c.value === client.homeDetailCenterId)) {
    writableCenters.unshift({ value: client.homeDetailCenterId, label: view.homeCenter });
  }

  return (
    <AppShell state={state} screen="clientDetail" title={view.title} description={view.subtitle}>
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {clientsCopy.created}
        </p>
      ) : null}
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={clientsCopy.homeCenterLabel} value={view.homeCenter} />
        <KpiCard
          label={clientsCopy.lastVisitLabel}
          value={view.lastVisit}
          {...(view.lastVisitCenter ? { caption: view.lastVisitCenter } : {})}
        />
        <KpiCard label={clientsCopy.vehiclesTitle} value={String(view.vehiclesCount)} caption="activos" />
        <KpiCard label="Promociones" value={view.consent} caption={view.centers} />
      </div>

      <Card title={clientsCopy.vehiclesTitle}>
        <Table
          caption={clientsCopy.vehiclesTitle}
          rows={client.vehicles}
          rowKey={(v) => v.id}
          emptyMessage={clientsCopy.noVehicles}
          columns={[
            { key: "vehicle", header: "Vehículo", value: (v) => vehicleLabel(v) },
            { key: "identifier", header: "Identificador", value: (v) => v.identifier ?? "—" },
            {
              key: "status",
              header: "Estado",
              value: (v) => (v.active ? "Activo" : clientsCopy.vehicleInactive),
            },
          ]}
        />
        {canWrite ? (
          <>
            <h3 className="font-semibold">{clientsCopy.addVehicle}</h3>
            <AddVehicleForm clientId={client.id} requestId={randomUUID()} />
            <h3 className="font-semibold">{clientsCopy.deactivateVehicle}</h3>
            <DeactivateVehicleForm clientId={client.id} vehicles={client.vehicles} />
          </>
        ) : null}
      </Card>

      <Card title={clientsCopy.historyTitle} subtitle={clientsCopy.historyNote}>
        {!history.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {clientErrorMessage(history.error)}
          </p>
        ) : history.data.length === 0 ? (
          <EmptyState title={clientsCopy.historyEmpty} />
        ) : (
          <ol className="flex flex-col gap-sm">
            {history.data.map((entry) => {
              const e = presentHistoryEntry(entry, center.timezone);
              return (
                <li
                  key={e.key}
                  className="flex flex-wrap items-center gap-sm border-b border-border pb-sm text-sm"
                >
                  <span className="text-muted">{e.date}</span>
                  <Badge label={e.kind} />
                  <span className="flex-1">{e.title}</span>
                  <span className="text-muted">{e.center}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {canWrite ? (
        <Card title={clientsCopy.editTitle} subtitle={clientsCopy.editSubtitle}>
          <EditClientForm client={client} centers={writableCenters} />
        </Card>
      ) : null}
    </AppShell>
  );
}
