import {
  activeCenterAccess,
  presentSupplyLot,
  supplyLotAlert,
  supplyLotsCopy,
  todayIn,
} from "@meguiars/domain";
import { createExecutionRepository, createSupplyLotRepository } from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { CloseSupplyLotForm, RegisterSupplyLotForm } from "@/components/supply-lot-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Lotes de insumos con caducidad del centro activo (ADR 0052). */
export default async function SupplyLotsPage() {
  const state = await requireScreen("supplyLots");
  const center = activeCenterAccess(state)!.center;
  const supabase = (await createSupabaseServerClient())!;
  const [lots, items] = await Promise.all([
    createSupplyLotRepository(supabase).list(center.id, true),
    createExecutionRepository(supabase).listInventory(center.organizationId),
  ]);
  const activeItems = items.ok ? items.data.filter((i) => i.active) : [];
  const all = lots.ok ? lots.data.map(presentSupplyLot) : [];
  const open = all.filter((l) => l.status === "activo");
  const closed = all.filter((l) => l.status !== "activo");
  const alert = lots.ok ? supplyLotAlert(lots.data) : null;
  return (
    <AppShell
      state={state}
      screen="supplyLots"
      title={supplyLotsCopy.title}
      description={`${supplyLotsCopy.description} · ${center.name}`}
    >
      {alert ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone={alert.tone}>
          {alert.text}
        </p>
      ) : null}
      <Card title={supplyLotsCopy.add}>
        {activeItems.length ? (
          <RegisterSupplyLotForm
            items={activeItems}
            requestId={crypto.randomUUID()}
            today={todayIn(center.timezone)}
          />
        ) : (
          <p className="text-sm text-muted">{supplyLotsCopy.noItems}</p>
        )}
      </Card>
      <Card title={supplyLotsCopy.title}>
        {!lots.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {lots.error.message}
          </p>
        ) : open.length === 0 ? (
          <EmptyState title={supplyLotsCopy.empty} />
        ) : (
          <ul className="flex flex-col divide-y" data-testid="supply-lots">
            {open.map((l) => (
              <li key={l.id} className="flex flex-col gap-xs py-sm">
                <div className="flex flex-wrap items-center gap-xs">
                  <span className="font-medium">{l.item}</span>
                  <span className="text-sm text-muted">
                    {supplyLotsCopy.lotCode} {l.lotCode}
                  </span>
                  <Badge label={l.stateLabel} tone={l.tone} />
                </div>
                <p className="text-sm">
                  {l.expiry} ({l.expiresOn}) · {supplyLotsCopy.receivedOn} {l.receivedOn} · {l.quantityLabel}
                  {l.notes ? ` · ${l.notes}` : ""}
                </p>
                <CloseSupplyLotForm lot={l} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {closed.length ? (
        <Card title={supplyLotsCopy.history}>
          <ul className="flex flex-col gap-xs text-sm">
            {closed.map((l) => (
              <li key={l.id}>
                {l.item} · {supplyLotsCopy.lotCode} {l.lotCode} · {l.stateLabel}
                {l.closedReason ? ` — ${l.closedReason}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </AppShell>
  );
}
