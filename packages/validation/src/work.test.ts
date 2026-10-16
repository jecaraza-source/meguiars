import { describe, expect, it } from "vitest";
import {
  linkTechnicianSchema,
  myWorkCommentSchema,
  myWorkDaySchema,
  myWorkDoneSchema,
  myWorkProblemSchema,
} from "./work";

const ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

describe("«Mi día»", () => {
  it("día opcional en formato ISO", () => {
    expect(myWorkDaySchema.parse({ detailCenterId: ID, day: "" }).day).toBeUndefined();
    expect(myWorkDaySchema.parse({ detailCenterId: ID, day: "2026-10-15" }).day).toBe("2026-10-15");
    expect(myWorkDaySchema.safeParse({ detailCenterId: ID, day: "15/10/2026" }).success).toBe(false);
  });

  it("trabajo realizado con nota opcional", () => {
    expect(myWorkDoneSchema.parse({ itemId: ID, note: "  " }).note).toBeUndefined();
    expect(myWorkDoneSchema.parse({ itemId: ID, note: " Listo " }).note).toBe("Listo");
    expect(myWorkDoneSchema.safeParse({ itemId: ID, note: "x".repeat(1001) }).success).toBe(false);
  });

  it("comentario obligatorio y problema con descripción", () => {
    expect(myWorkCommentSchema.safeParse({ orderId: ID, note: "   " }).success).toBe(false);
    expect(myWorkCommentSchema.parse({ orderId: ID, itemId: "", note: "Rayón" }).itemId).toBeUndefined();
    expect(myWorkProblemSchema.safeParse({ orderId: ID, description: "no" }).success).toBe(false);
    expect(myWorkProblemSchema.parse({ orderId: ID, description: " Falta shampoo " }).description).toBe(
      "Falta shampoo",
    );
  });

  it("ligar o desligar un técnico exige motivo", () => {
    expect(
      linkTechnicianSchema.parse({ technicianId: ID, userId: "", reason: "Ya no trabaja" }).userId,
    ).toBeNull();
    expect(linkTechnicianSchema.parse({ technicianId: ID, userId: ID, reason: "Alta" }).userId).toBe(ID);
    expect(linkTechnicianSchema.safeParse({ technicianId: ID, userId: ID, reason: "" }).success).toBe(false);
  });
});
