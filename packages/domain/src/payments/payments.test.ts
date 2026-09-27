import { describe, expect, it } from "vitest";
import { can, isReadOnlyRole } from "../roles";
import {
  allowedPaymentMethods,
  orderPaymentStatus,
  PAYMENT_METHOD_RULES,
  PAYMENT_METHODS,
  summarizeTenders,
} from "./payments";
import { paymentErrorMessage, paymentRange, presentOrderPayment } from "./presenter";

const order = { total: 2800, paidAmount: 0, b2bAccountId: null };

describe("estado de pago de la OS (espejo de la columna generada)", () => {
  it("pendiente, parcial y pagada según el saldo", () => {
    expect(orderPaymentStatus(2800, 0)).toBe("pendiente");
    expect(orderPaymentStatus(2800, 500)).toBe("parcial");
    expect(orderPaymentStatus(2800, 2800)).toBe("pagada");
    expect(orderPaymentStatus(0, 0)).toBe("pagada");
  });
});

describe("formas de pago", () => {
  it("efectivo, tarjeta y transferencia entran a caja; membresía y crédito B2B no", () => {
    expect(PAYMENT_METHODS.filter((m) => PAYMENT_METHOD_RULES[m].collectsCash)).toEqual([
      "efectivo",
      "tarjeta",
      "transferencia",
    ]);
    expect(PAYMENT_METHOD_RULES.otro.active).toBe(false);
  });

  it("OS a cuenta B2B sólo a crédito; membresía sólo con una vigente", () => {
    expect(allowedPaymentMethods({ b2bAccountId: "acc" })).toEqual(["credito_b2b"]);
    expect(allowedPaymentMethods({ b2bAccountId: null })).toEqual(["efectivo", "tarjeta", "transferencia"]);
    expect(allowedPaymentMethods({ b2bAccountId: null, hasActiveMembership: true })).toContain("membresia");
  });
});

describe("vista previa del cobro (mismas reglas que la base)", () => {
  it("cobro parcial en efectivo con cambio (no es sobrepago)", () => {
    const s = summarizeTenders(order, [{ method: "efectivo", amount: 500 }], 1000);
    expect(s).toMatchObject({
      total: 500,
      cash: 500,
      change: 500,
      remaining: 2300,
      status: "parcial",
      error: null,
    });
  });

  it("pago mixto que salda la OS", () => {
    const s = summarizeTenders(order, [
      { method: "tarjeta", amount: 1300 },
      { method: "transferencia", amount: 1500, reference: "SPEI-9" },
    ]);
    expect(s).toMatchObject({ total: 2800, remaining: 0, status: "pagada", error: null });
  });

  it("rechaza sobrepago, transferencia sin referencia, efectivo insuficiente e importes inválidos", () => {
    expect(summarizeTenders(order, [{ method: "tarjeta", amount: 2800.01 }]).error).toMatch(/excede/);
    expect(summarizeTenders(order, [{ method: "transferencia", amount: 10 }]).error).toMatch(/referencia/);
    expect(summarizeTenders(order, [{ method: "efectivo", amount: 300 }], 200).error).toMatch(/efectivo/);
    expect(summarizeTenders(order, [{ method: "efectivo", amount: 0.001 }]).error).toBe("Importe inválido");
    expect(summarizeTenders(order, [{ method: "efectivo", amount: 0.29 }]).error).toBeNull();
    expect(summarizeTenders(order, []).error).toMatch(/al menos/);
  });

  it("respeta la regla B2B", () => {
    expect(summarizeTenders(order, [{ method: "credito_b2b", amount: 10 }]).error).toMatch(/crédito B2B/);
    expect(
      summarizeTenders({ ...order, b2bAccountId: "acc" }, [{ method: "efectivo", amount: 10 }]).error,
    ).toMatch(/cuenta B2B/);
  });

  it("parte del saldo ya cobrado", () => {
    const s = summarizeTenders({ ...order, paidAmount: 2500 }, [{ method: "tarjeta", amount: 400 }]);
    expect(s.error).toMatch(/excede/);
  });
});

describe("presentación", () => {
  it("se cobra desde autorizada (incluida entregada con saldo); abierta no", () => {
    expect(presentOrderPayment({ ...order, status: "autorizada" }).payable).toBe(true);
    expect(presentOrderPayment({ ...order, status: "entregada" }).payable).toBe(true);
    expect(presentOrderPayment({ ...order, status: "abierta" }).blocked).toMatch(/autorizada/);
    expect(presentOrderPayment({ ...order, status: "terminada", paidAmount: 2800 }).blocked).toMatch(
      /pagada/,
    );
  });

  it("rangos del corte y errores", () => {
    expect(paymentRange("hoy", "2026-09-27")).toEqual({ from: "2026-09-27", to: "2026-09-27" });
    expect(paymentRange("7", "2026-09-27")).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(paymentErrorMessage({ kind: "conflict", code: "40001", message: "x" })).toMatch(
      /otro dispositivo/,
    );
    expect(paymentErrorMessage({ kind: "unavailable", message: "fetch failed" })).toMatch(/conexión/);
  });
});

describe("permisos", () => {
  it("contador lee y sigue siendo sólo lectura; revertir es de encargado y admin", () => {
    expect(can(["contador"], "payments.read")).toBe(true);
    expect(can(["contador"], "payments.write")).toBe(false);
    expect(isReadOnlyRole("contador")).toBe(true);
    expect(can(["operador_recepcion"], "payments.write")).toBe(true);
    expect(can(["operador_recepcion"], "payments.reverse")).toBe(false);
    expect(can(["encargado"], "payments.reverse")).toBe(true);
    expect(can(["comercial_b2b"], "payments.read")).toBe(false);
  });
});
