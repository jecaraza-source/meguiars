import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createAgendaRepository } from "./agenda";

const CENTER = "11111111-1111-4111-8111-111111111111";
const CLIENT = "c1000000-0000-4000-8000-000000000001";
const VEHICLE = "c2000000-0000-4000-8000-000000000001";
const SERVICE = "5e000000-0000-4000-8000-000000000001";
const APPT = "a0000000-0000-4000-8000-000000000001";

function fakeRpc(response: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => Object.assign(Promise.resolve(response), { single }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("AgendaRepository (Supabase)", () => {
  it("agenda del día con filtros opcionales", async () => {
    const { client, rpc } = fakeRpc({ data: [], error: null });
    await createAgendaRepository(client).listDay(CENTER, "2026-10-01", { status: "programada", bayId: "" });
    expect(rpc).toHaveBeenCalledWith("list_appointments", {
      p_detail_center_id: CENTER,
      p_day: "2026-10-01",
      p_status: "programada",
    });
  });

  it("alta: envía los ids y la hora UTC; bahía ocupada llega como conflicto 23P01", async () => {
    const { client, rpc } = fakeRpc({ data: null, error: { code: "23P01", message: "ocupada" } });
    const result = await createAgendaRepository(client).create({
      detailCenterId: CENTER,
      requestId: APPT,
      clientId: CLIENT,
      vehicleId: VEHICLE,
      serviceIds: [SERVICE],
      startsAt: "2026-10-01T16:00:00.000Z",
      walkIn: false,
    });
    expect(rpc).toHaveBeenCalledWith("create_appointment", {
      p_detail_center_id: CENTER,
      p_request_id: APPT,
      p_client_id: CLIENT,
      p_vehicle_id: VEHICLE,
      p_service_ids: [SERVICE],
      p_starts_at: "2026-10-01T16:00:00.000Z",
      p_walk_in: false,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "conflict", code: "23P01" } });
  });

  it("estatus: cancelar sin motivo no llega al backend", async () => {
    const { client, rpc } = fakeRpc({ data: null, error: null });
    const result = await createAgendaRepository(client).setStatus({ id: APPT, status: "cancelada" });
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { kind: "validation" } });
  });

  it("borrador de OS con precios numéricos", async () => {
    const { client } = fakeRpc({
      data: [
        {
          appointment_id: APPT,
          detail_center_id: CENTER,
          client_id: CLIENT,
          vehicle_id: VEHICLE,
          service_id: SERVICE,
          service_code: "LAV",
          service_name: "Lavado",
          revenue_engine: "recurrente",
          unit_price: "250.00",
          unit_direct_cost: 80,
          duration_minutes: 40,
        },
      ],
      error: null,
    });
    expect(await createAgendaRepository(client).orderDraft(APPT)).toEqual({
      ok: true,
      data: {
        appointmentId: APPT,
        detailCenterId: CENTER,
        clientId: CLIENT,
        vehicleId: VEHICLE,
        lines: [
          {
            serviceId: SERVICE,
            serviceCode: "LAV",
            serviceName: "Lavado",
            revenueEngine: "recurrente",
            unitPrice: 250,
            unitDirectCost: 80,
            durationMinutes: 40,
          },
        ],
      },
    });
  });
});
