import { describe, expect, it } from "vitest";
import { closeCashSchema, openCashSchema, reopenCashSchema } from "./cash";

const ID = "00000000-0000-4000-8000-000000000001";

describe("corte de caja", () => {
  it("apertura: turno y fondo en texto", () => {
    expect(
      openCashSchema.parse({
        detailCenterId: ID,
        requestId: ID,
        shift: "matutino",
        openingFloat: "$1,000",
        notes: "",
      }),
    ).toEqual({ detailCenterId: ID, requestId: ID, shift: "matutino", openingFloat: 1000, notes: undefined });
    expect(
      openCashSchema.safeParse({ detailCenterId: ID, requestId: ID, shift: "x", openingFloat: 0 }).success,
    ).toBe(false);
    expect(
      openCashSchema.safeParse({ detailCenterId: ID, requestId: ID, shift: "unico", openingFloat: "-5" })
        .success,
    ).toBe(false);
  });

  it("cierre: una diferencia exige nota; cuadrado no", () => {
    const base = { sessionId: ID, version: "2", requestId: ID, expectedCash: "1750" };
    expect(closeCashSchema.safeParse({ ...base, countedCash: "1,700", notes: "" }).success).toBe(false);
    expect(closeCashSchema.parse({ ...base, countedCash: "1,700", notes: "Faltan $50" })).toMatchObject({
      countedCash: 1700,
      version: 2,
      notes: "Faltan $50",
    });
    expect(closeCashSchema.parse({ ...base, countedCash: "1750", notes: "" }).notes).toBeUndefined();
    expect(closeCashSchema.safeParse({ ...base, countedCash: "17.555" }).success).toBe(false);
  });

  it("reapertura: motivo obligatorio", () => {
    expect(reopenCashSchema.safeParse({ sessionId: ID, version: 3, reason: "" }).success).toBe(false);
    expect(reopenCashSchema.parse({ sessionId: ID, version: 3, reason: " Recontar " }).reason).toBe(
      "Recontar",
    );
  });
});
