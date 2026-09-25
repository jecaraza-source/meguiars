import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createServiceOrderRepository } from "./orders";

const CENTER = "11111111-1111-4111-8111-111111111111";
const CLIENT = "c1000000-0000-4000-8000-000000000001";
const VEHICLE = "c2000000-0000-4000-8000-000000000001";
const LAV = "5e000000-0000-4000-8000-000000000001";
const ORDER = "0d000000-0000-4000-8000-000000000001";
const REQUEST = "30000000-0000-4000-8000-000000000001";

function fakeRpc(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(response));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const row = { id: ORDER, version: 4, status: "abierta" };

describe("ServiceOrderRepository (Supabase)", () => {
  it("alta walk-in: líneas como jsonb y sólo los opcionales presentes; devuelve la versión", async () => {
    const { client, rpc } = fakeRpc({ data: row, error: null });
    const result = await createServiceOrderRepository(client).create({
      detailCenterId: CENTER,
      requestId: REQUEST,
      clientId: CLIENT,
      vehicleId: VEHICLE,
      items: [{ serviceId: LAV, quantity: 2 }],
      channel: "b2c",
      odometerKm: 0,
    });
    expect(rpc).toHaveBeenCalledWith("create_service_order", {
      p_detail_center_id: CENTER,
      p_request_id: REQUEST,
      p_client_id: CLIENT,
      p_vehicle_id: VEHICLE,
      p_items: [{ service_id: LAV, quantity: 2 }],
      p_channel: "b2c",
      p_odometer_km: 0,
    });
    expect(result).toEqual({ ok: true, data: { id: ORDER, version: 4, status: "abierta" } });
  });

  it("versión vieja (40001) llega como conflicto; regla de canal (MG002) como validación", async () => {
    const stale = fakeRpc({ data: null, error: { code: "40001", message: "La OS cambió" } });
    expect(
      await createServiceOrderRepository(stale.client).setStatus({
        orderId: ORDER,
        version: 3,
        status: "autorizada",
      }),
    ).toMatchObject({ ok: false, error: { kind: "conflict", code: "40001" } });
    const rule = fakeRpc({ data: null, error: { code: "MG002", message: "Hay saldo pendiente" } });
    expect(
      await createServiceOrderRepository(rule.client).setStatus({
        orderId: ORDER,
        version: 3,
        status: "entregada",
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation", message: "Hay saldo pendiente" } });
  });

  it("pausar sin motivo y descuentos inválidos no llegan al backend", async () => {
    const { client, rpc } = fakeRpc({ data: row, error: null });
    const repo = createServiceOrderRepository(client);
    expect(await repo.setStatus({ orderId: ORDER, version: 3, status: "pausada" })).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    });
    expect(
      await repo.addDiscount({ orderId: ORDER, version: 3, kind: "percent", value: 150, reason: "Promo" }),
    ).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("descuento a la OS completa envía p_item_id null; datos vacíos se envían como null", async () => {
    const { client, rpc } = fakeRpc({ data: row, error: null });
    const repo = createServiceOrderRepository(client);
    await repo.addDiscount({ orderId: ORDER, version: 3, kind: "amount", value: 100, reason: "Cortesía" });
    expect(rpc).toHaveBeenLastCalledWith("add_service_order_discount", {
      p_order_id: ORDER,
      p_version: 3,
      p_item_id: null,
      p_kind: "amount",
      p_value: 100,
      p_reason: "Cortesía",
    });
    await repo.updateDetails({ orderId: ORDER, version: 3, channel: "b2c", recommendations: "Encerar" });
    expect(rpc).toHaveBeenLastCalledWith(
      "update_service_order_details",
      expect.objectContaining({ p_recommendations: "Encerar", p_bay_id: null, p_next_visit_on: null }),
    );
  });

  it("detalle: importes numéricos, líneas por posición y vehículo del snapshot", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: ORDER,
        detail_center_id: CENTER,
        folio: "CDMX-01-000002",
        status: "abierta",
        version: 2,
        channel: "b2c",
        channel_reference: null,
        appointment_id: null,
        client_id: CLIENT,
        vehicle_id: VEHICLE,
        client_name: "José",
        client_phone: null,
        client_email: null,
        vehicle_make: "Mazda",
        vehicle_model: "3",
        vehicle_year: 2021,
        vehicle_plate: "ABC1234",
        subtotal: "2800.00",
        discount_total: "280.00",
        total: "2520.00",
        cost_total: "950.00",
        paid_amount: "0.00",
        authorized_total: null,
        worked_minutes: 0,
        estimated_minutes: 300,
        service_order_items: [
          {
            id: "b",
            position: 1,
            unit_price: "90",
            unit_direct_cost: "30",
            line_subtotal: "90",
            line_discount: "0",
            quantity: 1,
          },
          {
            id: "a",
            position: 0,
            unit_price: "2800",
            unit_direct_cost: "950",
            line_subtotal: "2800",
            line_discount: "280",
            quantity: 1,
          },
        ],
        service_order_discounts: [],
        service_order_status_history: [],
        bays: null,
        technicians: null,
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select })) } as unknown as MeguiarsSupabaseClient;
    const result = await createServiceOrderRepository(client).get(ORDER);
    expect(result.ok && result.data).toMatchObject({
      total: 2520,
      discountTotal: 280,
      vehicleLabel: "Mazda 3 2021 · ABC1234",
      items: [
        { id: "a", lineDiscount: 280 },
        { id: "b", unitPrice: 90 },
      ],
    });
  });
});
