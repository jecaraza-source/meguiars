import {
  activeCenterAccess,
  canManageServices,
  catalogCopy,
  executionCopy,
  formatUnitCost,
  INVENTORY_UNIT_LABELS,
} from "@meguiars/domain";
import { createExecutionRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InventoryItemForm } from "@/components/supply-forms";
import { Badge, Card, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Insumos de la organización: base del consumo estándar vs real (sin existencias ni almacén). */
export default async function SuppliesPage() {
  const state = await requireScreen("supplies");
  const center = activeCenterAccess(state)!.center;
  const repo = createExecutionRepository((await createSupabaseServerClient())!);
  const result = await repo.listInventory(center.organizationId);
  const manage = canManageServices(state);

  return (
    <AppShell
      state={state}
      screen="supplies"
      title={executionCopy.suppliesTitle}
      description={executionCopy.suppliesDescription}
    >
      <Link href="/catalogo" className="text-sm underline">
        ← {catalogCopy.title}
      </Link>
      {manage ? (
        <Card title={executionCopy.supplyAdd}>
          <InventoryItemForm />
        </Card>
      ) : null}
      <Card title={executionCopy.suppliesTitle}>
        {!result.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {result.error.message}
          </p>
        ) : manage ? (
          result.data.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul aria-label={executionCopy.suppliesTitle} className="flex flex-col gap-md">
              {result.data.map((i) => (
                <li key={i.id} className="mg-card flex flex-col gap-sm">
                  <div className="flex flex-wrap items-center gap-sm text-sm font-semibold">
                    {i.name} · {i.code}
                    {!i.active ? <Badge label={executionCopy.supplyInactive} /> : null}
                  </div>
                  <InventoryItemForm item={i} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <Table
            caption={executionCopy.suppliesTitle}
            rows={result.data}
            rowKey={(i) => i.id}
            emptyMessage="—"
            columns={[
              { key: "code", header: executionCopy.supplyCode, value: (i) => i.code },
              { key: "name", header: executionCopy.supplyName, value: (i) => i.name },
              { key: "unit", header: executionCopy.supplyUnit, value: (i) => INVENTORY_UNIT_LABELS[i.unit] },
              {
                key: "cost",
                header: executionCopy.supplyCost,
                value: (i) => formatUnitCost(i.unitCost),
                align: "end",
              },
              {
                key: "active",
                header: "Estatus",
                value: (i) => (i.active ? "Activo" : executionCopy.supplyInactive),
              },
            ]}
          />
        )}
      </Card>
    </AppShell>
  );
}
