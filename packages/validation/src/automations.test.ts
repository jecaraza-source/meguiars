import { describe, expect, it } from "vitest";
import { automationSchema } from "./automations";

const U = "11111111-1111-4111-8111-111111111111";
const base = {
  organizationId: U,
  detailCenterId: U,
  name: "Recompra",
  trigger: "mantenimiento",
  delayDays: "30",
  serviceIds: [U, U],
  leadSources: [],
  dueInDays: "1",
  messageTemplate: "Hola {nombre}, ya toca tu {servicio}",
  cooldownDays: "30",
  maxPerRun: "50",
  contactFrom: "09:00",
  contactTo: "19:00",
  reason: "Alta de regla",
};

describe("validación de automatizaciones", () => {
  it("acepta una regla válida y quita servicios repetidos", () => {
    const r = automationSchema.safeParse(base);
    expect(r.success && r.data.serviceIds).toEqual([U]);
    expect(r.success && r.data.delayDays).toBe(30);
  });

  it("rechaza marcadores inventados, horario invertido y condiciones que no aplican", () => {
    const bad = automationSchema.safeParse({
      ...base,
      trigger: "cliente_inactivo",
      messageTemplate: "Hola {nombre}, {precio} con {descuento}",
      contactFrom: "19:00",
      contactTo: "09:00",
      leadSources: ["instagram"],
    });
    expect(bad.success).toBe(false);
    const paths = bad.error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(paths).toEqual(
      expect.arrayContaining(["messageTemplate", "contactTo", "serviceIds", "leadSources"]),
    );
  });

  it("asignar responsable exige centro y los límites se respetan", () => {
    expect(automationSchema.safeParse({ ...base, detailCenterId: "", assignTo: U }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, cooldownDays: "0" }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, maxPerRun: "501" }).success).toBe(false);
  });
});
