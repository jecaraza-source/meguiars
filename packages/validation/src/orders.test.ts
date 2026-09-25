import { describe, expect, it } from "vitest";
import { fieldErrors } from "./auth";
import {
  addDiscountSchema,
  discountFormSchema,
  linesFromQuantities,
  newOrderFormSchema,
  orderDetailsFormSchema,
  paymentFormSchema,
  recordPaymentSchema,
  setOrderItemSchema,
  setOrderStatusSchema,
  toCreateServiceOrderCommand,
  toUpdateOrderDetailsCommand,
} from "./orders";

const CENTER = "11111111-1111-4111-8111-111111111111";
const CLIENT = "c1000000-0000-4000-8000-000000000001";
const VEHICLE = "c2000000-0000-4000-8000-000000000001";
const LAV = "5e000000-0000-4000-8000-000000000001";
const AROM = "5e000000-0000-4000-8000-000000000006";
const ORDER = "0d000000-0000-4000-8000-000000000001";
const REQUEST = "30000000-0000-4000-8000-000000000001";

describe("OS: validación compartida", () => {
  it("web (texto) y móvil producen la misma OS, con la hora prometida del centro en UTC", () => {
    const ctx = {
      detailCenterId: CENTER,
      requestId: REQUEST,
      clientId: CLIENT,
      timeZone: "America/Mexico_City",
    };
    const web = toCreateServiceOrderCommand(
      newOrderFormSchema.parse({
        vehicleId: VEHICLE,
        channel: "b2c",
        channelReference: "",
        lines: linesFromQuantities({ [LAV]: "1", [AROM]: "2", "5e000000-0000-4000-8000-000000000003": "" }),
        bayId: "",
        technicianId: "",
        observations: " Rayón ",
        odometerKm: "45,210",
        promisedDate: "2026-10-01",
        promisedTime: "18:00",
      }),
      ctx,
    );
    const mobile = toCreateServiceOrderCommand(
      newOrderFormSchema.parse({
        vehicleId: VEHICLE,
        channel: "b2c",
        lines: [
          { serviceId: LAV, quantity: 1 },
          { serviceId: AROM, quantity: 2 },
        ],
        observations: "Rayón",
        odometerKm: 45210,
        promisedDate: "2026-10-01",
        promisedTime: "18:00",
      }),
      ctx,
    );
    expect(web).toEqual(mobile);
    expect(web).toMatchObject({
      items: [
        { serviceId: LAV, quantity: 1 },
        { serviceId: AROM, quantity: 2 },
      ],
      odometerKm: 45210,
      promisedAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("exige vehículo, al menos una línea, cantidades válidas y fecha con hora", () => {
    const r = newOrderFormSchema.safeParse({
      vehicleId: "",
      channel: "b2c",
      lines: [],
      promisedDate: "2026-10-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldErrors(r.error)).toMatchObject({
        vehicleId: "Elige el vehículo",
        lines: "Agrega al menos un servicio o producto",
        promisedTime: "Indica la hora prometida",
      });
    }
    expect(
      newOrderFormSchema.safeParse({
        vehicleId: VEHICLE,
        channel: "b2c",
        lines: [{ serviceId: LAV, quantity: 100 }],
      }).success,
    ).toBe(false);
  });

  it("línea: cantidad 0 = quitar; motivo opcional salvo lo que exija la base", () => {
    expect(setOrderItemSchema.parse({ orderId: ORDER, version: "3", serviceId: LAV, quantity: "0" })).toEqual(
      {
        orderId: ORDER,
        version: 3,
        serviceId: LAV,
        quantity: 0,
        reason: undefined,
      },
    );
    expect(
      setOrderItemSchema.safeParse({ orderId: ORDER, version: 3, serviceId: LAV, quantity: 1, reason: "x" })
        .success,
    ).toBe(false);
  });

  it("descuento: valor positivo, porcentaje ≤ 100 y motivo", () => {
    expect(
      discountFormSchema.parse({ itemId: "", kind: "amount", value: "$1,250.50", reason: "Cortesía" }),
    ).toEqual({
      itemId: undefined,
      kind: "amount",
      value: 1250.5,
      reason: "Cortesía",
    });
    const bad = discountFormSchema.safeParse({ kind: "percent", value: "120", reason: "" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(Object.keys(fieldErrors(bad.error)).sort()).toEqual(["reason", "value"]);
    expect(
      addDiscountSchema.safeParse({
        orderId: ORDER,
        version: 2,
        kind: "percent",
        value: 10,
        reason: "Frecuente",
      }).success,
    ).toBe(true);
  });

  it("estatus: pausar y cancelar exigen motivo", () => {
    expect(setOrderStatusSchema.safeParse({ orderId: ORDER, version: 2, status: "pausada" }).success).toBe(
      false,
    );
    expect(
      setOrderStatusSchema.safeParse({ orderId: ORDER, version: 2, status: "cancelada", reason: "No esperó" })
        .success,
    ).toBe(true);
    expect(setOrderStatusSchema.safeParse({ orderId: ORDER, version: 2, status: "terminada" }).success).toBe(
      true,
    );
  });

  it("datos: próxima visita y hora prometida del centro a UTC", () => {
    const form = orderDetailsFormSchema.parse({
      channel: "b2b",
      channelReference: " OC-7781 ",
      nextVisitOn: "2026-10-15",
      nextVisitServiceId: LAV,
      recommendations: "Lavar chasis",
      odometerKm: "",
      promisedDate: "2026-10-01",
      promisedTime: "09:30",
    });
    expect(
      toUpdateOrderDetailsCommand(form, { orderId: ORDER, version: 4, timeZone: "America/Monterrey" }),
    ).toEqual({
      orderId: ORDER,
      version: 4,
      channel: "b2b",
      channelReference: "OC-7781",
      bayId: undefined,
      technicianId: undefined,
      diagnosis: undefined,
      observations: undefined,
      recommendations: "Lavar chasis",
      nextVisitOn: "2026-10-15",
      nextVisitServiceId: LAV,
      nextVisitNotes: undefined,
      odometerKm: undefined,
      promisedAt: "2026-10-01T15:30:00.000Z",
    });
  });

  it("cobro: importe positivo y forma de pago conocida", () => {
    expect(paymentFormSchema.parse({ amount: "1,000", method: "tarjeta", reference: "" })).toEqual({
      amount: 1000,
      method: "tarjeta",
      reference: undefined,
    });
    expect(paymentFormSchema.safeParse({ amount: "0", method: "cripto" }).success).toBe(false);
    expect(
      recordPaymentSchema.safeParse({ orderId: ORDER, version: 1, amount: 10, method: "efectivo" }).success,
    ).toBe(true);
  });
});
