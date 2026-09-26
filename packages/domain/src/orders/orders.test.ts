import { describe, expect, it } from "vitest";
import {
  authorizationBlocker,
  canTransitionOrder,
  deliveryBlocker,
  discountLevelOf,
  levelAllows,
  requiredDiscountLevel,
  type ServiceOrder,
} from "./order";
import { orderStatusActions, presentOrder, presentOrderListItem, workedMinutes } from "./presenter";
import { computeOrderTotals, orderBalance, orderMargin, previewDiscount } from "./totals";

// Mismo ejemplo que supabase/tests/service_orders.test.sql.
const items = [
  { id: "lav", quantity: 1, unitPrice: 250, unitDirectCost: 80, durationMinutes: 40 },
  { id: "pol", quantity: 1, unitPrice: 2800, unitDirectCost: 900, durationMinutes: 120 },
  { id: "arom", quantity: 2, unitPrice: 90, unitDirectCost: 30, durationMinutes: 5 },
];

const order = (patch: Partial<ServiceOrder> = {}): ServiceOrder => ({
  id: "o1",
  organizationId: "org",
  detailCenterId: "A",
  folio: "A-01-000001",
  status: "abierta",
  version: 3,
  channel: "b2c",
  channelReference: null,
  appointmentId: null,
  clientId: "c",
  vehicleId: "v",
  clientName: "José Pérez",
  clientPhone: null,
  clientEmail: null,
  vehicleLabel: "Mazda 3 2021 · ABC1234",
  odometerKm: null,
  bayId: null,
  bayName: null,
  technicianId: null,
  technicianName: null,
  diagnosis: null,
  observations: null,
  recommendations: null,
  nextVisitOn: null,
  nextVisitServiceId: null,
  nextVisitNotes: null,
  subtotal: 3230,
  discountTotal: 0,
  total: 3230,
  costTotal: 1040,
  estimatedMinutes: 170,
  paidAmount: 0,
  authorizedAt: null,
  authorizedTotal: null,
  promisedAt: null,
  startedAt: null,
  finishedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  workStartedAt: null,
  workedMinutes: 0,
  createdAt: "2026-10-01T16:00:00Z",
  items: [],
  discounts: [],
  history: [],
  ...patch,
});

describe("transiciones de la OS", () => {
  it("sigue el flujo abierta → autorizada → en proceso ⇄ pausada → terminada → entregada", () => {
    expect(canTransitionOrder("abierta", "autorizada")).toBe(true);
    expect(canTransitionOrder("en_proceso", "pausada")).toBe(true);
    expect(canTransitionOrder("pausada", "en_proceso")).toBe(true);
    expect(canTransitionOrder("terminada", "entregada")).toBe(true);
  });

  it("rechaza saltos y reabrir OS cerradas", () => {
    expect(canTransitionOrder("abierta", "en_proceso")).toBe(false);
    expect(canTransitionOrder("en_proceso", "cancelada")).toBe(false);
    expect(canTransitionOrder("entregada", "abierta")).toBe(false);
    expect(canTransitionOrder("cancelada", "autorizada")).toBe(false);
  });
});

describe("niveles de autorización de descuentos", () => {
  it.each([
    [0, "operador"],
    [10, "operador"],
    [10.01, "encargado"],
    [30, "encargado"],
    [34.6, "admin"],
  ] as const)("%s %% exige %s", (pct, level) => {
    expect(requiredDiscountLevel(pct)).toBe(level);
  });

  it("el nivel del usuario sale de su rol más alto en el centro", () => {
    expect(discountLevelOf(["operador_recepcion"])).toBe("operador");
    expect(discountLevelOf(["operador_recepcion", "encargado"])).toBe("encargado");
    expect(discountLevelOf(["admin_socio"])).toBe("admin");
    expect(discountLevelOf(["contador"])).toBeNull();
    expect(levelAllows("encargado", "operador")).toBe(true);
    expect(levelAllows("encargado", "admin")).toBe(false);
    expect(levelAllows(null, "operador")).toBe(false);
  });
});

describe("totales (espejo de private.recalc_service_order)", () => {
  it("sin descuentos: 250 + 2800 + 2 × 90 = 3230; costo 1040; 170 min", () => {
    const t = computeOrderTotals(items, []);
    expect(t).toMatchObject({
      subtotal: 3230,
      discountTotal: 0,
      total: 3230,
      costTotal: 1040,
      estimatedMinutes: 170,
    });
  });

  it("10 % a una línea, 100 a la OS y 25 % sobre lo que queda (misma secuencia que la prueba SQL)", () => {
    const line = { itemId: "pol", kind: "percent", value: 10 } as const;
    const amount = { itemId: null, kind: "amount", value: 100 } as const;
    const promo = { itemId: null, kind: "percent", value: 25 } as const;
    expect(computeOrderTotals(items, [line])).toMatchObject({ discountTotal: 280, total: 2950 });
    expect(computeOrderTotals(items, [line, amount])).toMatchObject({ discountTotal: 380, total: 2850 });
    expect(computeOrderTotals(items, [line, amount, promo])).toMatchObject({
      discountTotal: 1117.5,
      total: 2112.5,
    });
    expect(computeOrderTotals(items, [line, amount, { ...promo, voided: true }]).total).toBe(2850);
  });

  it("topa los descuentos al importe y redondea a centavos", () => {
    const t = computeOrderTotals(
      [{ id: "x", quantity: 1, unitPrice: 99.99, unitDirectCost: 0, durationMinutes: 0 }],
      [
        { itemId: "x", kind: "percent", value: 12.5 },
        { itemId: "x", kind: "amount", value: 500 },
      ],
    );
    expect(t.lines.x).toEqual({ subtotal: 99.99, discount: 99.99 });
    expect(t.total).toBe(0);
    expect(
      computeOrderTotals(
        [{ ...items[0]!, unitPrice: 99.99 }],
        [{ itemId: null, kind: "percent", value: 12.5 }],
      ).orderDiscount,
    ).toBe(12.5);
  });

  it("vista previa del descuento: nivel exigido por el acumulado y errores de la base", () => {
    const base = computeOrderTotals(items, [{ itemId: "pol", kind: "percent", value: 10 }]);
    expect(previewDiscount(base, 0, { itemId: null, kind: "amount", value: 100 })).toEqual({
      amount: 100,
      percentAfter: 11.8,
      requiredLevel: "encargado",
      error: null,
    });
    expect(previewDiscount(base, 0, { itemId: null, kind: "amount", value: 5000 }).error).toMatch(/excede/);
    expect(previewDiscount(base, 2950, { itemId: null, kind: "amount", value: 10 }).error).toMatch(
      /saldo a favor/,
    );
  });

  it("margen con la definición única del catálogo y saldo nunca negativo", () => {
    expect(orderMargin({ total: 2850, costTotal: 1040 })).toEqual({ amount: 1810, percent: 63.5 });
    expect(orderBalance({ total: 2850, paidAmount: 1000 })).toBe(1850);
    expect(orderBalance({ total: 100, paidAmount: 150 })).toBe(0);
  });
});

describe("reglas por canal", () => {
  const line = [{}];
  it("autorizar: al menos una línea; membresía y B2B piden su referencia", () => {
    expect(authorizationBlocker({ ...order(), items: [] })).toMatch(/al menos una línea/);
    expect(authorizationBlocker({ ...order({ channel: "membresia" }), items: line })).toMatch(/membresía/);
    expect(authorizationBlocker({ ...order({ channel: "b2b" }), items: line })).toMatch(/orden de compra/);
    expect(
      authorizationBlocker({ ...order({ channel: "b2b", channelReference: "OC-1" }), items: line }),
    ).toBeNull();
  });

  it("entregar: B2C y membresía cobradas; B2B a crédito con orden de compra", () => {
    expect(deliveryBlocker({ ...order({ total: 100, paidAmount: 50 }), items: line })).toMatch(/saldo/);
    expect(deliveryBlocker({ ...order({ total: 100, paidAmount: 100 }), items: line })).toBeNull();
    expect(deliveryBlocker({ ...order({ channel: "membresia", total: 0 }), items: line })).toBeNull();
    expect(
      deliveryBlocker({ ...order({ channel: "b2b", channelReference: "OC-1", total: 900 }), items: line }),
    ).toBeNull();
  });
});

describe("presentadores", () => {
  it("acciones de estatus con bloqueos visibles antes de intentar", () => {
    const terminated = order({ status: "terminada", total: 2850, paidAmount: 0 });
    expect(orderStatusActions(terminated, ["operador_recepcion"])).toEqual([
      expect.objectContaining({ to: "entregada", blocker: expect.stringMatching(/saldo/) }),
    ]);
    const authorized = order({ status: "autorizada" });
    const cancel = (roles: Parameters<typeof orderStatusActions>[1]) =>
      orderStatusActions(authorized, roles).find((a) => a.to === "cancelada");
    expect(cancel(["operador_recepcion"])).toMatchObject({
      needsReason: true,
      blocker: "Sólo encargado o admin",
    });
    expect(cancel(["encargado"])?.blocker).toBeNull();
    expect(orderStatusActions(order({ status: "en_proceso" }), ["encargado"]).map((a) => a.to)).toEqual([
      "pausada",
      "terminada",
    ]);
  });

  it("KPIs de la OS y permisos de edición por estatus", () => {
    const view = presentOrder(
      order({ status: "autorizada", total: 2850, costTotal: 1040, paidAmount: 1000 }),
    );
    expect(view.kpis.map((k) => k.value)).toEqual(["$2,850.00", "$1,850.00", "$1,810.00", "0 min"]);
    expect(view).toMatchObject({
      canEditItems: true,
      itemsNeedReason: true,
      canPay: true,
      canChangeChannel: false,
    });
    expect(presentOrder(order({ status: "entregada" }))).toMatchObject({
      canEditItems: false,
      canEditDetails: false,
    });
  });

  it("tiempo real: minutos acumulados más el tramo en curso", () => {
    const now = new Date("2026-10-01T17:00:00Z");
    expect(workedMinutes({ workedMinutes: 50, workStartedAt: "2026-10-01T16:30:00Z" }, now)).toBe(80);
    expect(workedMinutes({ workedMinutes: 50, workStartedAt: null }, now)).toBe(50);
  });

  it("fila del listado con saldo pendiente", () => {
    const row = presentOrderListItem(
      {
        id: "o1",
        folio: "A-01-000001",
        status: "terminada",
        channel: "b2c",
        clientName: "José",
        vehicleLabel: "Mazda",
        bayName: "Bahía 1",
        technicianName: null,
        total: 2850,
        paidAmount: 1000,
        estimatedMinutes: 170,
        promisedAt: null,
        appointmentId: null,
        createdAt: "2026-10-01T16:00:00Z",
      },
      "America/Mexico_City",
    );
    expect(row).toMatchObject({ status: "Terminada", balance: "$1,850.00", resources: "Bahía 1" });
  });
});
