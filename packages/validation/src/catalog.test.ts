import { describe, expect, it } from "vitest";
import { fieldErrors } from "./auth";
import {
  catalogFilterSchema,
  centerConfigSchema,
  createServiceSchema,
  moneySchema,
  updateServiceSchema,
} from "./catalog";

const ORG = "00000000-0000-4000-8000-00000000d3e0";
const ID = "5e000000-0000-4000-8000-000000000001";

describe("catálogo: validación compartida", () => {
  it("importes: texto de formulario o número, ≥ 0 y máximo 2 decimales", () => {
    expect(moneySchema.parse("1,250.50")).toBe(1250.5);
    expect(moneySchema.parse("$ 90")).toBe(90);
    expect(moneySchema.parse(12000)).toBe(12000);
    expect(moneySchema.safeParse("-1").success).toBe(false);
    expect(moneySchema.safeParse("10.999").success).toBe(false);
    expect(moneySchema.safeParse("abc").success).toBe(false);
  });

  it("el formulario web (texto) y el móvil (números) producen el mismo alta", () => {
    const web = createServiceSchema.parse({
      organizationId: ORG,
      code: " lav-exp ",
      name: "Lavado  exprés",
      description: "",
      revenueEngine: "recurrente",
      standardDurationMinutes: "40",
      basePrice: "250",
      standardDirectCost: "80.00",
    });
    const mobile = createServiceSchema.parse({
      organizationId: ORG,
      code: "LAV-EXP",
      name: "Lavado exprés",
      revenueEngine: "recurrente",
      standardDurationMinutes: 40,
      basePrice: 250,
      standardDirectCost: 80,
    });
    expect(web).toEqual(mobile);
    expect(web).toMatchObject({ code: "LAV-EXP", name: "Lavado exprés", description: undefined });
  });

  it("campos obligatorios: motor, nombre, duración, precio y costo", () => {
    const bad = createServiceSchema.safeParse({
      organizationId: ORG,
      code: "x",
      name: "",
      revenueEngine: "",
      standardDurationMinutes: "0",
      basePrice: "",
      standardDirectCost: "-5",
    });
    expect(Object.keys(fieldErrors(bad.error!)).sort()).toEqual(
      ["basePrice", "code", "name", "revenueEngine", "standardDirectCost", "standardDurationMinutes"].sort(),
    );
  });

  it("editar o desactivar exige motivo", () => {
    const base = {
      id: ID,
      name: "Lavado",
      revenueEngine: "recurrente",
      standardDurationMinutes: 40,
      basePrice: 300,
      standardDirectCost: 95,
      active: false,
    };
    expect(updateServiceSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
    expect(updateServiceSchema.safeParse({ ...base, reason: "Se deja de vender" }).success).toBe(true);
  });

  it("configuración del centro: importes vacíos = usa el valor base", () => {
    expect(
      centerConfigSchema.parse({
        detailCenterId: ORG,
        serviceId: ID,
        available: true,
        priceOverride: "",
        directCostOverride: "70",
        reason: "Costo local",
      }),
    ).toMatchObject({ priceOverride: undefined, directCostOverride: 70 });
  });

  it("filtro por motor", () => {
    expect(catalogFilterSchema.parse({ revenueEngine: "" }).revenueEngine).toBeUndefined();
    expect(catalogFilterSchema.parse({ revenueEngine: "premium" }).revenueEngine).toBe("premium");
    expect(catalogFilterSchema.safeParse({ revenueEngine: "otro" }).success).toBe(false);
  });
});
