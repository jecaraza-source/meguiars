import { describe, expect, it } from "vitest";
import { fieldErrors } from "./auth";
import {
  closeSupplyLotSchema,
  registerSupplyLotSchema,
  consumptionFormSchema,
  evidenceMetaSchema,
  incidentFormSchema,
  inventoryItemSchema,
  itemWorkSchema,
  staffSchema,
  supplyStandardSchema,
} from "./execution";

const ID = "0d000000-0000-4000-8000-000000000001";
const ID2 = "1a000000-0000-4000-8000-000000000001";

describe("ejecución: validación compartida", () => {
  it("línea: sólo iniciar, pausar o terminar (no volver a pendiente)", () => {
    expect(itemWorkSchema.safeParse({ itemId: ID, status: "en_proceso", technicianId: "" }).success).toBe(
      true,
    );
    expect(itemWorkSchema.safeParse({ itemId: ID, status: "pendiente" }).success).toBe(false);
  });

  it("personal sin duplicados", () => {
    expect(staffSchema.parse({ orderId: ID, technicianIds: [ID2, ID2] }).technicianIds).toEqual([ID2]);
  });

  it("foto: tipo, tamaño máximo (5 MB) y momento", () => {
    expect(
      evidenceMetaSchema.safeParse({ kind: "antes", contentType: "image/jpeg", sizeBytes: 350_000 }).success,
    ).toBe(true);
    const big = evidenceMetaSchema.safeParse({
      kind: "antes",
      contentType: "image/jpeg",
      sizeBytes: 6_000_000,
    });
    expect(big.success).toBe(false);
    if (!big.success) expect(fieldErrors(big.error).sizeBytes).toMatch(/5 MB/);
    expect(
      evidenceMetaSchema.safeParse({ kind: "antes", contentType: "image/gif", sizeBytes: 10 }).success,
    ).toBe(false);
  });

  it("consumo: texto de web y número de móvil producen lo mismo; nunca negativo", () => {
    const web = consumptionFormSchema.parse({ itemId: ID, inventoryItemId: ID2, actualQuantity: "1,250.5" });
    const mobile = consumptionFormSchema.parse({ itemId: ID, inventoryItemId: ID2, actualQuantity: 1250.5 });
    expect(web).toEqual(mobile);
    expect(
      consumptionFormSchema.safeParse({ itemId: ID, inventoryItemId: ID2, actualQuantity: "-1" }).success,
    ).toBe(false);
    expect(
      consumptionFormSchema.safeParse({ itemId: ID, inventoryItemId: ID2, actualQuantity: "0.1234" }).success,
    ).toBe(false);
  });

  it("incidencia con tipo y descripción", () => {
    expect(
      incidentFormSchema.safeParse({ orderId: ID, kind: "retrabajo", description: "Hologramas" }).success,
    ).toBe(true);
    expect(incidentFormSchema.safeParse({ orderId: ID, kind: "otro", description: "x" }).success).toBe(false);
  });

  it("insumo: clave normalizada, costo con 4 decimales; estándar vacío = quitar", () => {
    expect(
      inventoryItemSchema.parse({
        organizationId: ID,
        code: " shp-01 ",
        name: "Shampoo  neutro",
        unit: "ml",
        unitCost: "0.0625",
        active: true,
        reason: "Alta de insumo",
      }),
    ).toMatchObject({ code: "SHP-01", name: "Shampoo neutro", unitCost: 0.0625 });
    expect(
      supplyStandardSchema.parse({
        serviceId: ID,
        inventoryItemId: ID2,
        quantity: "",
        reason: "Ya no se usa",
      }).quantity,
    ).toBeUndefined();
    expect(
      supplyStandardSchema.safeParse({
        serviceId: ID,
        inventoryItemId: ID2,
        quantity: "0",
        reason: "Estándar",
      }).success,
    ).toBe(false);
  });
});

describe("lotes de insumos", () => {
  const base = {
    requestId: "8c8a2d8e-3f5a-4a4e-9a49-2a6f0b8e8a11",
    inventoryItemId: "1c8a2d8e-3f5a-4a4e-9a49-2a6f0b8e8a11",
    lotCode: " L-1 ",
    expiresOn: "2026-12-01",
  };
  it("acepta campos opcionales vacíos del formulario", () => {
    const r = registerSupplyLotSchema.parse({ ...base, receivedOn: "", quantity: "", notes: "" });
    expect(r).toMatchObject({ lotCode: "L-1", receivedOn: undefined, quantity: undefined, notes: undefined });
    expect(registerSupplyLotSchema.parse({ ...base, quantity: "2.5" }).quantity).toBe(2.5);
  });
  it("rechaza fecha inválida y cierre sin motivo", () => {
    expect(registerSupplyLotSchema.safeParse({ ...base, expiresOn: "01/12/2026" }).success).toBe(false);
    expect(
      closeSupplyLotSchema.safeParse({ id: base.requestId, version: "1", outcome: "retirado", reason: "" })
        .success,
    ).toBe(false);
  });
});
