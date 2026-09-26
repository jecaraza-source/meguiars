import {
  activeCenterAccess,
  canManageServices,
  catalogCopy,
  executionCopy,
  presentCatalogItem,
  REVENUE_ENGINE_LABELS,
  REVENUE_ENGINES,
  type RevenueEngine,
  type ViewState,
} from "@meguiars/domain";
import { createCatalogRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Select } from "@/ui/controls";
import { Card, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentCatalogItem>;

async function fetchCatalog(
  client: MeguiarsSupabaseClient,
  centerId: string,
  engine: RevenueEngine | "",
  includeInactive: boolean,
): Promise<ViewState<Row[]>> {
  // Mismo catálogo que la web: center_catalog con el centro activo y el motor elegido.
  const result = await createCatalogRepository(client).listForCenter(centerId, {
    revenueEngine: engine || undefined,
    includeInactive,
  });
  if (!result.ok) return { status: "error", message: result.error.message };
  const rows = result.data.map(presentCatalogItem);
  return rows.length ? { status: "ready", data: rows } : { status: "empty" };
}

export function CatalogScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
  onSupplies,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: () => void; onSupplies: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [engine, setEngine] = useState<RevenueEngine | "">("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [rows, setRows] = useState<ViewState<Row[]>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchCatalog(client, center.id, engine, includeInactive).then((next) => {
      if (active) setRows(next);
    });
    return () => {
      active = false;
    };
  }, [client, center.id, engine, includeInactive]);

  return (
    <Screen
      title={`${catalogCopy.title} · ${center.name}`}
      description={catalogCopy.description}
      header={header}
    >
      {subnav}
      <Card>
        <Select
          label={catalogCopy.engineFilter}
          options={[
            { value: "", label: catalogCopy.allEngines },
            ...REVENUE_ENGINES.map((e) => ({ value: e, label: REVENUE_ENGINE_LABELS[e] })),
          ]}
          value={engine}
          onChange={(v) => setEngine(v as RevenueEngine | "")}
        />
        <Checkbox
          label={catalogCopy.includeInactive}
          checked={includeInactive}
          onChange={setIncludeInactive}
        />
        {canManageServices(state) ? <Button label={catalogCopy.newService} onPress={onNew} /> : null}
        <Button label={executionCopy.suppliesOpen} variant="secondary" onPress={onSupplies} />
      </Card>
      {rows.status === "loading" ? <Skeleton lines={4} label="Cargando catálogo" /> : null}
      {rows.status === "error" ? <Notice tone="danger" text={rows.message} /> : null}
      {rows.status === "empty" || rows.status === "ready" ? (
        <List
          caption={catalogCopy.title}
          rows={rows.status === "ready" ? rows.data : []}
          rowKey={(r) => r.id}
          onRowPress={(r) => onOpen(r.id)}
          emptyMessage={catalogCopy.empty}
          columns={[
            { key: "name", header: "Servicio", value: (r) => r.name },
            { key: "engine", header: "Motor", value: (r) => r.engine },
            { key: "duration", header: "Duración", value: (r) => r.duration },
            { key: "price", header: "Precio", value: (r) => r.price },
            { key: "cost", header: "Costo directo", value: (r) => r.cost },
            { key: "margin", header: "Margen estándar", value: (r) => r.margin },
            { key: "status", header: "Estado", value: (r) => r.status },
          ]}
        />
      ) : null}
    </Screen>
  );
}
