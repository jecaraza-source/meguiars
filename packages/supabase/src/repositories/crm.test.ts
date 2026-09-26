import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createCrmRepository } from "./crm";

const ID = "00000000-0000-4000-8000-000000000001";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("CrmRepository (Supabase)", () => {
  it("lista con centros, segmento y próxima visita; convierte importes", async () => {
    const { client, rpc } = fake({
      data: [
        {
          client_id: ID,
          full_name: "José",
          phone: "+525512345678",
          email: null,
          kind: "person",
          segment: "recurrente",
          visits: 2,
          last_visit_at: null,
          services_value: "250.00",
          membership_value: "449.00",
          lifetime_value: "699.00",
          membership_id: null,
          membership_number: null,
          membership_plan: null,
          membership_status: null,
          membership_ends_on: null,
          next_visit_on: "2026-10-20",
          next_visit_state: "proxima",
          next_visit_service: "Lavado",
          next_visit_order_id: null,
          next_visit_folio: null,
          open_tasks: 1,
          opted_in_channels: ["whatsapp"],
        },
      ],
      error: null,
    });
    const r = await createCrmRepository(client).listCustomers([ID], {
      segment: "recurrente",
      due: "proxima",
    });
    expect(rpc).toHaveBeenCalledWith("crm_customers", {
      p_detail_center_ids: [ID],
      p_segment: "recurrente",
      p_due: "proxima",
    });
    expect(r).toMatchObject({
      ok: true,
      data: [{ lifetimeValue: 699, servicesValue: 250, optedInChannels: ["whatsapp"] }],
    });
  });

  it("la ficha de un cliente no autorizado es not_found", async () => {
    const { client } = fake({ data: [], error: null });
    const r = await createCrmRepository(client).getCustomer(ID, [ID]);
    expect(r.ok).toBe(false);
  });

  it("valida antes de llamar y traduce la regla de consentimiento (MG002)", async () => {
    const bad = fake({ data: null, error: null });
    expect((await createCrmRepository(bad.client).cancelTask(ID, "")).ok).toBe(false);
    expect(bad.rpc).not.toHaveBeenCalled();
    const { client } = fake({
      data: null,
      error: { code: "MG002", message: "El cliente no aceptó contacto por whatsapp" },
    });
    const r = await createCrmRepository(client).createTask({
      detailCenterId: ID,
      requestId: ID,
      clientId: ID,
      kind: "whatsapp",
      dueOn: "2026-10-05",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/no aceptó contacto/);
  });
});
