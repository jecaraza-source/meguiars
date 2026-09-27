import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createPipelineRepository } from "./pipeline";

const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("PipelineRepository (Supabase)", () => {
  it("alta de un prospecto B2B: jsonb del prospecto y de la propuesta normalizados", async () => {
    const { client, rpc } = fake({ data: { id: V }, error: null });
    const r = await createPipelineRepository(client).create({
      detailCenterId: U,
      requestId: V,
      kind: "b2b",
      title: "Flotilla",
      estimatedValue: 114_000,
      prospect: { companyName: "Hoteles Reforma", contactName: "Laura", contactPhone: "5544443333" },
      proposal: { billingModel: "iguala", feeAmount: 9500, includedUnits: 24 },
    });
    expect(r).toEqual({ ok: true, data: { id: V } });
    expect(rpc).toHaveBeenCalledWith(
      "create_opportunity",
      expect.objectContaining({
        p_kind: "b2b",
        p_client_id: null,
        p_prospect: expect.objectContaining({
          company_name: "Hoteles Reforma",
          contact_phone: "+525544443333",
        }),
        p_proposal: expect.objectContaining({
          billing_model: "iguala",
          fee_amount: 9500,
          included_units: 24,
        }),
      }),
    );
  });

  it("B2C premium sin cliente no llega a la base", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    const r = await createPipelineRepository(client).create({
      detailCenterId: U,
      requestId: V,
      kind: "b2c_premium",
      title: "Cerámico",
      estimatedValue: 12_000,
    });
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lista: importes numéricos, prospecto y propuesta agrupados", async () => {
    const { client, rpc } = fake({
      data: [
        {
          id: U,
          organization_id: V,
          detail_center_id: V,
          center_name: "CDMX",
          kind: "b2b",
          title: "Flotilla",
          display_name: "Hoteles Reforma",
          client_id: null,
          b2b_account_id: null,
          company_name: "Hoteles Reforma",
          legal_name: null,
          rfc: null,
          contact_name: "Laura",
          contact_title: null,
          contact_phone: "+525544443333",
          contact_email: null,
          estimated_value: "114000.00",
          stage_id: V,
          stage_name: "Propuesta",
          stage_position: 3,
          stage_probability: 50,
          status: "abierta",
          owner_id: null,
          owner_name: null,
          next_action: "Llamar",
          next_action_on: "2026-10-02",
          expected_close_on: null,
          source: "referido",
          proposed_billing_model: "iguala",
          proposed_months: 12,
          proposed_vehicle_rule: "cualquiera",
          proposed_payment_terms_days: 30,
          proposed_credit_limit: null,
          proposed_fee_amount: "9500.00",
          proposed_included_units: 24,
          notes: null,
          closed_at: null,
          won_value: null,
          loss_reason: null,
          loss_notes: null,
          converted_account_id: null,
          converted_agreement_id: null,
          open_tasks: 1,
          version: 3,
          created_at: "2026-09-20T15:00:00Z",
          today: "2026-10-01",
        },
      ],
      error: null,
    });
    const r = await createPipelineRepository(client).list([V]);
    expect(rpc).toHaveBeenCalledWith("list_opportunities", {
      p_detail_center_ids: [V],
      p_status: "abierta",
      p_kind: null,
      p_owner_id: null,
    });
    expect(r).toMatchObject({
      ok: true,
      data: [
        { estimatedValue: 114_000, proposal: { feeAmount: 9500, billingModel: "iguala" }, openTasks: 1 },
      ],
    });
  });

  it("ganar devuelve la cuenta y el convenio creados; conflicto de versión visible", async () => {
    const ok = fake({ data: { converted_account_id: U, converted_agreement_id: V }, error: null });
    expect(
      await createPipelineRepository(ok.client).win({ id: U, version: 2, createAgreement: true }),
    ).toEqual({
      ok: true,
      data: { accountId: U, agreementId: V },
    });
    const stale = fake({ data: null, error: { code: "40001", message: "La oportunidad cambió" } });
    expect((await createPipelineRepository(stale.client).move(U, 1, V)).ok).toBe(false);
  });

  it("hechos de métricas: números y etapas alcanzadas", async () => {
    const { client } = fake({
      data: [
        {
          opportunity_id: U,
          detail_center_id: V,
          kind: "b2b",
          created_on: "2026-10-01",
          created_value: "96000.00",
          outcome: "ganada",
          closed_on: "2026-10-10",
          won_value: "90000.00",
          current_value: "90000.00",
          current_stage_id: V,
          stages_reached: [U, V],
          cycle_days: "9.5",
        },
      ],
      error: null,
    });
    const r = await createPipelineRepository(client).metricFacts([V], "2026-10-01", "2026-10-31");
    expect(r).toMatchObject({
      ok: true,
      data: [{ wonValue: 90_000, cycleDays: 9.5, stagesReached: [U, V] }],
    });
  });
});
