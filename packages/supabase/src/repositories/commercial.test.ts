import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createCommercialRepository, toQuote } from "./commercial";

const U = "11111111-1111-4111-8111-111111111111";
const S = "33333333-3333-4333-8333-333333333333";

function fakeClient(data: unknown = { id: U, folio: "A-01-COT-00001", version: 2 }) {
  const rpc = vi.fn(() => Promise.resolve({ data, error: null }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("repositorio comercial", () => {
  it("convierte la cotización (numéricos como texto, líneas y descuentos en jsonb)", () => {
    const q = toQuote({
      id: U,
      detail_center_id: U,
      detail_center_name: "Centro A",
      folio: "A-01-COT-00001",
      lead_id: U,
      lead_name: "Ana R.",
      client_id: null,
      client_name: null,
      vehicle_id: null,
      vehicle_label: null,
      contact_name: "Ana R.",
      status: "enviada",
      expired: false,
      valid_until: "2026-10-15",
      subtotal: "1000.00" as unknown as number,
      discount_total: "140.00" as unknown as number,
      total: "860.00" as unknown as number,
      standard_cost_total: 160,
      operator_pay_total: 108,
      cost_total: 268,
      contribution_margin: 592,
      notes: null,
      appointment_id: null,
      appointment_starts_at: null,
      service_order_id: null,
      service_order_folio: null,
      sent_at: null,
      decided_at: null,
      decision_reason: null,
      items: [
        {
          id: "i1",
          service_id: S,
          service_code: "LAV-MAN",
          service_name: "Lavado manual detallado",
          revenue_engine: "valor_medio",
          unit_price: "400.00",
          price_source: "base",
          unit_direct_cost: 40,
          operator_commission_pct: 30,
          duration_minutes: 90,
          quantity: 1,
          line_subtotal: 400,
          line_discount: 40,
          operator_pay: "108.00",
          current_price: null,
        },
      ],
      discounts: [
        {
          id: "d1",
          item_id: null,
          kind: "amount",
          value: 100,
          amount: 100,
          reason: "Cliente recomendado",
          authorization_level: "encargado",
          authorized_by_name: "Elena",
          voided_at: null,
          void_reason: null,
          created_at: "2026-09-30T10:00:00Z",
        },
      ],
      version: 3,
      created_by_name: "Fer",
      created_at: "2026-09-30T10:00:00Z",
    });
    expect(q).toMatchObject({ subtotal: 1000, total: 860, discountTotal: 140, contributionMargin: 592 });
    expect(q.items[0]).toMatchObject({
      unitPrice: 400,
      operatorPay: 108,
      operatorCommissionPct: 30,
      currentPrice: null,
    });
    expect(q.discounts[0]).toMatchObject({ authorizationLevel: "encargado", authorizedByName: "Elena" });
  });

  it("valida antes de llamar: un prospecto sin contacto no llega a la base", async () => {
    const { client, rpc } = fakeClient();
    const repo = createCommercialRepository(client);
    const r = await repo.createLead({
      detailCenterId: U,
      requestId: U,
      fullName: "Ana",
      source: "instagram",
      interestServiceIds: [],
      consentChannels: [],
    });
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("envía la cotización con las líneas en el formato de la RPC", async () => {
    const { client, rpc } = fakeClient();
    const repo = createCommercialRepository(client);
    const r = await repo.createQuote({
      detailCenterId: U,
      requestId: U,
      items: [{ serviceId: S, quantity: 2 }],
      clientId: U,
    });
    expect(r).toEqual({ ok: true, data: { id: U, folio: "A-01-COT-00001" } });
    expect(rpc).toHaveBeenCalledWith(
      "create_quote",
      expect.objectContaining({ p_items: [{ service_id: S, quantity: 2 }], p_lead_id: null, p_client_id: U }),
    );
  });

  it("segmentos: filtros vacíos no se envían como listas vacías", async () => {
    const { client, rpc } = fakeClient([]);
    const repo = createCommercialRepository(client);
    await repo.segment([U], { minSpend: 1000 });
    expect(rpc).toHaveBeenCalledWith(
      "commercial_segment",
      expect.objectContaining({ p_service_ids: null, p_interest_service_ids: null, p_min_spend: 1000 }),
    );
  });

  it("sin teléfono ni email no busca coincidencias", async () => {
    const { client, rpc } = fakeClient([]);
    const r = await createCommercialRepository(client).leadMatches(U, undefined, undefined);
    expect(r).toEqual({ ok: true, data: [] });
    expect(rpc).not.toHaveBeenCalled();
  });
});
