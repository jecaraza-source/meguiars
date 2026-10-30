import { describe, expect, it } from "vitest";
import { expiryLabel, presentSupplyLot, supplyLotAlert, supplyLotState, type SupplyLot } from "./supply-lots";

const lot = (over: Partial<SupplyLot>): SupplyLot => ({
  id: "l",
  inventoryItemId: "i",
  itemCode: "CERA",
  itemName: "Cera",
  itemUnit: "ml",
  lotCode: "C-1",
  expiresOn: "2026-12-01",
  receivedOn: "2026-10-01",
  quantity: null,
  notes: null,
  status: "activo",
  state: "vigente",
  daysLeft: 32,
  closedReason: null,
  closedAt: null,
  version: 1,
  ...over,
});

describe("lotes de insumos", () => {
  it("mismo corte que la base: caducado, por caducar (≤ 30 días) y vigente", () => {
    expect(supplyLotState("2026-10-29", "2026-10-30")).toBe("caducado");
    expect(supplyLotState("2026-10-30", "2026-10-30")).toBe("por_caducar");
    expect(supplyLotState("2026-11-29", "2026-10-30")).toBe("por_caducar");
    expect(supplyLotState("2026-11-30", "2026-10-30")).toBe("vigente");
  });

  it("textos de caducidad", () => {
    expect(expiryLabel(-1)).toBe("Caducó hace 1 día");
    expect(expiryLabel(0)).toBe("Caduca hoy");
    expect(expiryLabel(10)).toBe("Caduca en 10 días");
  });

  it("aviso: caducados primero (peligro) y por caducar (atención)", () => {
    expect(supplyLotAlert([lot({})])).toBeNull();
    const a = supplyLotAlert([
      lot({ state: "caducado", daysLeft: -2, lotCode: "A1", itemName: "Shampoo" }),
      lot({ state: "por_caducar", daysLeft: 5 }),
      lot({ status: "retirado", state: null, daysLeft: -9 }),
    ]);
    expect(a?.tone).toBe("danger");
    expect(a?.text).toBe(
      "1 lote caducado: sácalo o reemplázalo (Shampoo A1). 1 por caducar en 30 días o menos: úsalo primero.",
    );
    expect(supplyLotAlert([lot({ state: "por_caducar", daysLeft: 3 })])?.tone).toBe("warning");
  });

  it("presenta cerrados con su resultado", () => {
    const p = presentSupplyLot(lot({ status: "agotado", state: null }));
    expect(p.stateLabel).toBe("Se terminó");
    expect(p.expiry).toBe("2026-12-01");
    expect(presentSupplyLot(lot({ quantity: 500 })).quantityLabel).toBe("500 ml");
  });
});
