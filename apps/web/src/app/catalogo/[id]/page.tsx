import {
  activeCenterAccess,
  canConfigureCenterCatalog,
  canManageServices,
  catalogCopy,
  centerName,
  executionCopy,
  presentCatalogItem,
  presentPriceHistory,
} from "@meguiars/domain";
import { createCatalogRepository, createExecutionRepository } from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { CenterConfigForm, EditServiceForm } from "@/components/catalog-forms";
import { SupplyStandards } from "@/components/supply-forms";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ServicePage({ params, searchParams }: PageProps<"/catalogo/[id]">) {
  const state = await requireScreen("catalogDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const created = (await searchParams).nuevo === "1";
  const supabase = (await createSupabaseServerClient())!;
  const repo = createCatalogRepository(supabase);
  const execution = createExecutionRepository(supabase);
  const manage = canManageServices(state);
  const [service, catalog, history, standards, inventory] = await Promise.all([
    repo.get(id),
    repo.listForCenter(center.id, { includeInactive: true }),
    repo.priceHistory(id),
    execution.listStandards(id),
    manage ? execution.listInventory(center.organizationId) : null,
  ]);
  const item = catalog.ok ? catalog.data.find((c) => c.id === id) : undefined;

  if (!service.ok || !item) {
    return (
      <AppShell state={state} screen="catalogDetail" title={catalogCopy.title}>
        <EmptyState
          title={catalogCopy.notFound}
          action={<ButtonLink href="/catalogo" label={catalogCopy.title} />}
        />
      </AppShell>
    );
  }

  const view = presentCatalogItem(item);
  return (
    <AppShell
      state={state}
      screen="catalogDetail"
      title={view.name}
      description={service.data.description ?? view.engine}
    >
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {catalogCopy.created}
        </p>
      ) : null}
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={catalogCopy.engineLabel} value={view.engine} caption={view.status} />
        <KpiCard label={catalogCopy.durationLabel} value={view.duration} />
        <KpiCard
          label={item.priceSource === "center" ? catalogCopy.centerPrice : catalogCopy.basePrice}
          value={view.price}
          caption={`Costo ${view.cost}`}
        />
        <KpiCard label="Margen estándar" value={view.margin} caption={center.name} />
      </div>

      <Card title={catalogCopy.historyTitle}>
        {!history.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {history.error.message}
          </p>
        ) : (
          <Table
            caption={catalogCopy.historyTitle}
            rows={history.data.map((h) =>
              presentPriceHistory(h, (cid) => centerName(state.access, cid), center.timezone),
            )}
            rowKey={(r) => r.key}
            emptyMessage={catalogCopy.historyEmpty}
            columns={[
              { key: "date", header: "Fecha", value: (r) => r.date },
              { key: "scope", header: "Aplica a", value: (r) => r.scope },
              { key: "price", header: "Precio", value: (r) => r.price, align: "end" },
              { key: "cost", header: "Costo", value: (r) => r.cost, align: "end" },
              { key: "reason", header: "Motivo", value: (r) => r.reason },
            ]}
          />
        )}
      </Card>

      <Card title={executionCopy.standardsTitle}>
        {standards.ok ? (
          <SupplyStandards
            serviceId={id}
            standards={standards.data}
            inventory={inventory?.ok ? inventory.data : []}
            editable={manage}
          />
        ) : (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {standards.error.message}
          </p>
        )}
      </Card>

      {canConfigureCenterCatalog(state) ? (
        <Card title={`${catalogCopy.centerTitle} · ${center.name}`} subtitle={catalogCopy.centerSubtitle}>
          <CenterConfigForm item={item} />
        </Card>
      ) : null}
      {manage ? (
        <Card title={catalogCopy.editTitle} subtitle={catalogCopy.editSubtitle}>
          <EditServiceForm service={service.data} />
        </Card>
      ) : null}
    </AppShell>
  );
}
