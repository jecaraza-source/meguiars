import { describe, expect, it } from "vitest";
import { can, isReadOnlyRole } from "../roles";
import {
  expenseActions,
  expenseReceiptPath,
  expenseStatusOnSave,
  isPnlExpense,
  PNL_GROUPS,
  requiresApproval,
} from "./expenses";
import { expenseErrorMessage, presentExpenseRow } from "./presenter";

describe("aprobación por umbral (espejo de la base)", () => {
  it("importe ≥ umbral requiere aprobación; sin umbral, nunca", () => {
    expect(requiresApproval(4999.99, 5000)).toBe(false);
    expect(requiresApproval(5000, 5000)).toBe(true);
    expect(requiresApproval(1_000_000, null)).toBe(false);
  });

  it("el admin queda autoaprobado; el encargado queda pendiente", () => {
    expect(expenseStatusOnSave(8000, 5000, false)).toBe("pendiente");
    expect(expenseStatusOnSave(8000, 5000, true)).toBe("aprobado");
    expect(expenseStatusOnSave(100, 5000, false)).toBe("aprobado");
  });

  it("acciones por estado y permiso", () => {
    expect(expenseActions("pendiente", { write: true, approve: false })).toEqual({
      edit: true,
      approve: false,
      reject: false,
      void: true,
      attach: true,
    });
    expect(expenseActions("aprobado", { write: true, approve: false }).void).toBe(false);
    expect(expenseActions("aprobado", { write: true, approve: true }).void).toBe(true);
    expect(expenseActions("anulado", { write: true, approve: true })).toEqual({
      edit: false,
      approve: false,
      reject: false,
      void: false,
      attach: false,
    });
    expect(expenseActions("pendiente", { write: false, approve: false }).edit).toBe(false);
  });
});

describe("P&L y comprobantes", () => {
  it("la compra de insumos no es gasto del P&L", () => {
    expect(PNL_GROUPS.filter((g) => !isPnlExpense(g))).toEqual(["insumos"]);
  });

  it("ruta del comprobante en el bucket privado", () => {
    expect(
      expenseReceiptPath({ organizationId: "o", detailCenterId: "c", id: "e" }, "f", "application/pdf"),
    ).toBe("o/c/e/f.pdf");
  });

  it("presentación y errores", () => {
    const row = presentExpenseRow({
      id: "e",
      detailCenterId: "c",
      folio: "A-01-E-000001",
      paidOn: "2026-09-27",
      concept: "Renta",
      amount: 18000,
      status: "pendiente",
      pnlGroup: "operativo",
      categoryId: "k",
      categoryName: "Renta",
      vendorId: null,
      vendorName: null,
      paymentMethod: "transferencia",
      attachments: 0,
      version: 1,
      createdByName: null,
      createdAt: "2026-09-27T12:00:00Z",
    });
    expect(row).toMatchObject({
      amount: "$18,000.00",
      status: "Pendiente de aprobación",
      vendor: "—",
      receipts: "—",
    });
    expect(expenseErrorMessage({ kind: "conflict", code: "40001", message: "x" })).toMatch(
      /otro dispositivo/,
    );
  });
});

describe("permisos", () => {
  it("contador lee y sigue de sólo lectura; aprobar es del admin; recepción y comercial no ven egresos", () => {
    expect(can(["contador"], "expenses.read")).toBe(true);
    expect(can(["contador"], "expenses.write")).toBe(false);
    expect(isReadOnlyRole("contador")).toBe(true);
    expect(can(["encargado"], "expenses.write")).toBe(true);
    expect(can(["encargado"], "expenses.approve")).toBe(false);
    expect(can(["admin_socio"], "expenses.approve")).toBe(true);
    expect(can(["operador_recepcion"], "expenses.read")).toBe(false);
    expect(can(["comercial_b2b"], "expenses.read")).toBe(false);
  });
});
