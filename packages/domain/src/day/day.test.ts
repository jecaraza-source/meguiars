import { describe, expect, it } from "vitest";
import { presentDaySummary, type DaySummary } from "../index";

const summary: DaySummary = {
  day: "2026-09-29",
  orders: {
    byStatus: { abierta: 1, autorizada: 2, en_proceso: 3, pausada: 1, terminada: 2 },
    active: [
      {
        id: "o1",
        folio: "CDMX-01-000010",
        status: "terminada",
        clientName: "Ana",
        vehicle: "Mazda 3 · ABC",
        total: 550,
        paidAmount: 550,
        promisedAt: "2026-09-29T20:00:00Z",
        bayName: "Bahía 1",
        technicianName: "Toño",
      },
      {
        id: "o2",
        folio: "CDMX-01-000011",
        status: "en_proceso",
        clientName: "Luis",
        vehicle: "Kia · XYZ",
        total: 1800,
        paidAmount: 500,
        promisedAt: null,
        bayName: null,
        technicianName: null,
      },
    ],
    deliveredToday: { count: 4, total: 3200, pending: 450 },
    openedToday: 6,
  },
  agenda: {
    byStatus: { programada: 3, recibida: 1, cancelada: 1, no_show: 1 },
    upcoming: [
      {
        id: "a1",
        startsAt: "2026-09-29T22:30:00Z",
        status: "programada",
        clientName: "Sofía",
        vehicle: "BMW · QWE",
        bayName: null,
      },
    ],
  },
  payments: { count: 5, total: 2750 },
};

describe("operación del día", () => {
  it("indicadores: taller, por iniciar, listas, entregadas, cobrado, sin cobrar y citas", () => {
    const v = presentDaySummary(summary, "America/Mexico_City");
    expect(v.kpis.map((k) => [k.key, k.value, k.caption])).toEqual([
      ["taller", "4", "1 en pausa"],
      ["por_iniciar", "3", "1 sin autorizar"],
      ["listas", "2", undefined],
      ["entregadas", "4", "Venta $3,200.00"],
      ["cobrado", "$2,750.00", "5 recibos"],
      ["por_cobrar", "$450.00", undefined],
      ["citas", "5", "3 por llegar · 1 no llegaron"],
    ]);
  });
  it("órdenes con enlace, saldo y hora de promesa del centro; citas con hora local", () => {
    const v = presentDaySummary(summary, "America/Mexico_City");
    expect(v.active[0]).toMatchObject({
      href: "/ordenes/o1",
      status: "Terminada",
      balance: "Pagada",
      where: "Bahía 1 · Toño",
      promised: expect.stringMatching(/^Promesa 2:00\s?p\.\s?m\.$/),
    });
    expect(v.active[1]).toMatchObject({ balance: "Saldo $1,300.00", where: null, promised: null });
    expect(v.upcoming[0]).toMatchObject({
      href: "/agenda/a1",
      time: expect.stringMatching(/^4:30\s?p\.\s?m\.$/),
      client: "Sofía",
    });
  });
  it("sin permiso de un módulo, su bloque no aparece", () => {
    const v = presentDaySummary({ ...summary, orders: null, agenda: null }, "America/Mexico_City");
    expect(v.kpis.map((k) => k.key)).toEqual(["cobrado"]);
    expect([v.showOrders, v.showAgenda]).toEqual([false, false]);
  });
});
