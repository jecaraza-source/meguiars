import type {
  InventoryUnit,
  SupplyLot,
  SupplyLotRepository,
  SupplyLotState,
  SupplyLotStatus,
} from "@meguiars/domain";
import { closeSupplyLotSchema, registerSupplyLotSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import { invalid, run } from "./shared";

/** Lotes de insumos con caducidad (ADR 0052): todo por RPC, estado calculado en la base. */
export function createSupplyLotRepository(client: MeguiarsSupabaseClient): SupplyLotRepository {
  return {
    list(detailCenterId, includeClosed = false) {
      return run(
        () =>
          client.rpc("supply_lots_for_center", {
            p_detail_center_id: detailCenterId,
            p_include_closed: includeClosed,
          }),
        (rows): SupplyLot[] =>
          rows.map((r) => ({
            id: r.id,
            inventoryItemId: r.inventory_item_id,
            itemCode: r.item_code,
            itemName: r.item_name,
            itemUnit: r.item_unit as InventoryUnit,
            lotCode: r.lot_code,
            expiresOn: r.expires_on,
            receivedOn: r.received_on,
            quantity: r.quantity === null ? null : Number(r.quantity),
            notes: r.notes,
            status: r.status as SupplyLotStatus,
            state: (r.state as SupplyLotState | null) ?? null,
            daysLeft: r.days_left,
            closedReason: r.closed_reason,
            closedAt: r.closed_at,
            version: r.version,
          })),
      );
    },
    register(command) {
      const parsed = registerSupplyLotSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("register_supply_lot", {
            p_detail_center_id: command.detailCenterId,
            p_request_id: c.requestId,
            p_inventory_item_id: c.inventoryItemId,
            p_lot_code: c.lotCode,
            p_expires_on: c.expiresOn,
            p_received_on: c.receivedOn ?? null,
            p_quantity: c.quantity ?? null,
            p_notes: c.notes ?? null,
          }),
        (id) => ({ id }),
      );
    },
    close(command) {
      const parsed = closeSupplyLotSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("close_supply_lot", {
            p_id: c.id,
            p_version: c.version,
            p_outcome: c.outcome,
            p_reason: c.reason,
          }),
        (version) => ({ version }),
      );
    },
  };
}
