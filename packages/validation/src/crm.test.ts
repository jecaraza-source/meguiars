import { describe, expect, it } from "vitest";
import {
  completeTaskSchema,
  contactPreferenceSchema,
  createTaskSchema,
  crmCustomerFilterSchema,
} from "./crm";

const id = "00000000-0000-4000-8000-000000000001";

describe("CRM", () => {
  it("seguimiento: tipo, fecha y canal opcional", () => {
    expect(
      createTaskSchema.parse({
        detailCenterId: id,
        requestId: id,
        clientId: id,
        kind: "renovar",
        channel: "",
        dueOn: "2026-10-05",
      }).channel,
    ).toBeUndefined();
    expect(
      createTaskSchema.safeParse({
        detailCenterId: id,
        requestId: id,
        clientId: id,
        kind: "gritar",
        dueOn: "2026-10-05",
      }).success,
    ).toBe(false);
    expect(
      createTaskSchema.safeParse({
        detailCenterId: id,
        requestId: id,
        clientId: id,
        kind: "llamar",
        dueOn: "mañana",
      }).success,
    ).toBe(false);
  });

  it("resultado de una lista cerrada; consentimiento exige motivo", () => {
    expect(completeTaskSchema.safeParse({ taskId: id, outcome: "agendo_cita" }).success).toBe(true);
    expect(completeTaskSchema.safeParse({ taskId: id, outcome: "gritó" }).success).toBe(false);
    expect(
      contactPreferenceSchema.safeParse({
        clientId: id,
        channel: "whatsapp",
        optedIn: false,
        source: "web",
        reason: "",
      }).success,
    ).toBe(false);
  });

  it("filtros: segmento y próxima visita válidos o vacíos", () => {
    expect(crmCustomerFilterSchema.parse({ segment: "", due: "vencida" })).toEqual({ due: "vencida" });
    expect(crmCustomerFilterSchema.safeParse({ segment: "vip" }).success).toBe(false);
  });
});
