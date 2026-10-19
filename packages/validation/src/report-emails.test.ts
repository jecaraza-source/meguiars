import { describe, expect, it } from "vitest";
import { reportSubscriptionSchema } from "./report-emails";

const base = {
  organizationId: "0e000000-0000-4000-8000-000000000001",
  id: "",
  version: "",
  name: "Resumen semanal",
  frequency: "semanal",
  centerIds: [],
  recipients: "dir@meguiars.mx, Socio@Correo.com\ndir@meguiars.mx",
  active: "on",
  reason: "Alta del reporte",
};

describe("programación de reportes por correo", () => {
  it("acepta el formulario y normaliza los correos", () => {
    const r = reportSubscriptionSchema.parse(base);
    expect(r.recipients).toEqual(["dir@meguiars.mx", "socio@correo.com"]);
    expect(r.id).toBeNull();
    expect(r.active).toBe(true);
    expect(r.centerIds).toEqual([]);
  });

  it("rechaza correos inválidos, vacíos o de más", () => {
    expect(reportSubscriptionSchema.safeParse({ ...base, recipients: "no-es-correo" }).success).toBe(false);
    expect(reportSubscriptionSchema.safeParse({ ...base, recipients: "  " }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `p${i}@x.mx`).join(",");
    expect(reportSubscriptionSchema.safeParse({ ...base, recipients: many }).success).toBe(false);
  });

  it("pide frecuencia válida, nombre y motivo", () => {
    expect(reportSubscriptionSchema.safeParse({ ...base, frequency: "cada_hora" }).success).toBe(false);
    expect(reportSubscriptionSchema.safeParse({ ...base, name: "x" }).success).toBe(false);
    expect(reportSubscriptionSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
  });

  it("un solo centro llega como texto", () => {
    const id = "aaaaaaaa-0000-4000-8000-000000000000";
    expect(reportSubscriptionSchema.parse({ ...base, centerIds: id }).centerIds).toEqual([id]);
  });
});
