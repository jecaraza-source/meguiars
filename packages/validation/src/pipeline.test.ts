import { describe, expect, it } from "vitest";
import {
  createOpportunitySchema,
  loseOpportunitySchema,
  opportunityTaskSchema,
  pipelineStageSchema,
  proposalSchema,
  winOpportunitySchema,
} from "./pipeline";

const ids = {
  center: "11111111-1111-4111-8111-111111111111",
  request: "20000000-0000-4000-8000-000000000001",
  client: "c1000000-0000-4000-8000-000000000001",
  opp: "0f000000-0000-4000-8000-000000000001",
};

describe("validación del pipeline", () => {
  it("prospecto B2B: normaliza contacto y RFC; exige empresa, contacto y un medio", () => {
    const ok = createOpportunitySchema.parse({
      detailCenterId: ids.center,
      requestId: ids.request,
      kind: "b2b",
      title: "  Flotilla   de 12  ",
      estimatedValue: "114,000",
      prospect: {
        companyName: "Hoteles Reforma",
        contactName: "Laura",
        contactPhone: "55 4444 3333",
        rfc: "hre100101ab1",
      },
      proposal: { billingModel: "iguala", feeAmount: "9500", includedUnits: "24", months: "12" },
      nextAction: "Llamar",
      nextActionOn: "2026-10-02",
    });
    expect(ok.title).toBe("Flotilla de 12");
    expect(ok.estimatedValue).toBe(114_000);
    expect(ok.prospect?.contactPhone).toBe("+525544443333");
    expect(ok.prospect?.rfc).toBe("HRE100101AB1");
    expect(ok.proposal?.months).toBe(12);

    const missing = createOpportunitySchema.safeParse({
      detailCenterId: ids.center,
      requestId: ids.request,
      kind: "b2b",
      title: "Sin contacto",
      estimatedValue: 1,
      prospect: { companyName: "X SA" },
    });
    expect(missing.success).toBe(false);
  });

  it("B2C premium exige cliente; la siguiente acción exige fecha", () => {
    const r = createOpportunitySchema.safeParse({
      detailCenterId: ids.center,
      requestId: ids.request,
      kind: "b2c_premium",
      title: "Cerámico",
      estimatedValue: 12000,
      nextAction: "Llamar",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toEqual(["clientId", "nextActionOn"]);
  });

  it("propuesta: paquete e iguala exigen cuota e incluidos", () => {
    expect(proposalSchema.safeParse({ billingModel: "paquete" }).success).toBe(false);
    expect(proposalSchema.safeParse({ billingModel: "por_vehiculo" }).success).toBe(true);
    expect(proposalSchema.safeParse({ billingModel: "" }).data?.billingModel).toBeUndefined();
  });

  it("ganar, perder, tareas y etapas", () => {
    expect(
      winOpportunitySchema.parse({ id: ids.opp, version: "3", createAgreement: true, wonValue: "" }).wonValue,
    ).toBeUndefined();
    expect(loseOpportunitySchema.safeParse({ id: ids.opp, version: 1, lossReason: "" }).success).toBe(false);
    expect(
      opportunityTaskSchema.safeParse({
        opportunityId: ids.opp,
        requestId: ids.request,
        kind: "reunion",
        dueOn: "2026-10-02",
      }).success,
    ).toBe(true);
    expect(
      pipelineStageSchema.safeParse({
        organizationId: ids.center,
        name: "Demo",
        position: 95,
        probability: 40,
        active: true,
        reason: "Nueva etapa",
      }).success,
    ).toBe(false);
  });
});
