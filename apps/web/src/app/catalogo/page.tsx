import {
  activeCenterAccess,
  canManageServices,
  catalogCopy,
  presentCatalogItem,
  REVENUE_ENGINE_LABELS,
  REVENUE_ENGINES,
} from "@meguiars/domain";
import { createCatalogRepository } from "@meguiars/supabase";
import { catalogFilterSchema } from "@meguiars/validation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, Table } from "@/components/ui/display";
import { Checkbox, Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CatalogPage({ searchParams }: PageProps<"/catalogo">) {
  const state = await requireScreen("catalog");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const engine = typeof params.motor === "string" ? params.motor : "";
  const includeInactive = params.inactivos === "1";

  const repo = createCatalogRepository((await createSupabaseServerClient())!);
  // Filtro por centro (el activo) y motor; un motor inexistente en la URL no consulta nada.
  const filter = catalogFilterSchema.safeParse({ revenueEngine: engine, includeInactive });
  const result = filter.success
    ? await repo.listForCenter(center.id, filter.data)
    : ({ ok: true, data: [] } as const);

  return (
    <AppShell
      state={state}
      screen="catalog"
      title={`${catalogCopy.title} · ${center.name}`}
      description={catalogCopy.description}
    >
      <Card
        actions={
          canManageServices(state) ? (
            <ButtonLink href="/catalogo/nuevo" label={catalogCopy.newService} variant="primary" />
          ) : null
        }
      >
        <form className="flex flex-col gap-sm md:flex-row md:items-end" action="/catalogo">
          <div className="flex-1">
            <Select
              name="motor"
              label={catalogCopy.engineFilter}
              options={[
                { value: "", label: catalogCopy.allEngines },
                ...REVENUE_ENGINES.map((e) => ({ value: e, label: REVENUE_ENGINE_LABELS[e] })),
              ]}
              defaultValue={engine}
            />
          </div>
          <Checkbox
            name="inactivos"
            value="1"
            label={catalogCopy.includeInactive}
            checked={includeInactive}
          />
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            {catalogCopy.filter}
          </button>
        </form>
      </Card>
      {!result.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {result.error.kind === "validation" ? catalogCopy.empty : result.error.message}
        </p>
      ) : (
        <Table
          caption={catalogCopy.title}
          rows={result.data.map(presentCatalogItem)}
          rowKey={(r) => r.id}
          rowHref={(r) => `/catalogo/${r.id}`}
          emptyMessage={catalogCopy.empty}
          columns={[
            { key: "name", header: "Servicio", value: (r) => r.name },
            { key: "engine", header: "Motor", value: (r) => r.engine },
            { key: "duration", header: "Duración", value: (r) => r.duration },
            { key: "price", header: "Precio", value: (r) => r.price, align: "end" },
            { key: "cost", header: "Costo directo", value: (r) => r.cost, align: "end" },
            { key: "margin", header: "Margen estándar", value: (r) => r.margin, align: "end" },
            { key: "status", header: "Estado", value: (r) => r.status },
          ]}
        />
      )}
    </AppShell>
  );
}
