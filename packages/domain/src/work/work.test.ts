import { describe, expect, it } from "vitest";
import { vehicleLabel } from "../clients/rules";
import {
  myWorkSummary,
  nextActionOf,
  orderProgress,
  orderStateOf,
  orderTimeLabel,
  sortOrders,
  type MyWorkOrder,
} from "./work";

const order = (over: Partial<MyWorkOrder>): MyWorkOrder => ({
  id: "o",
  organizationId: "org",
  detailCenterId: "c",
  folio: "A-1",
  status: "autorizada",
  scheduledAt: "2026-10-15T15:00:00Z",
  promisedAt: null,
  bay: null,
  vehicle: { make: "Mazda", model: "3", year: 2021, plate: "ABC1234" },
  observations: null,
  items: [],
  photos: [],
  comments: [],
  openProblems: 0,
  ...over,
});

describe("«Mi día»", () => {
  it("botón principal por servicio", () => {
    expect(nextActionOf({ status: "pendiente" })).toBe("start");
    expect(nextActionOf({ status: "pausada" })).toBe("start");
    expect(nextActionOf({ status: "en_proceso" })).toBe("done");
    expect(nextActionOf({ status: "terminada" })).toBeNull();
  });

  it("vehículo, avance y estado", () => {
    expect(vehicleLabel({ make: "Mazda", model: "3", year: 2021, plate: "ABC1234" })).toBe(
      "Mazda 3 2021 · ABC1234",
    );
    // Agendado por WhatsApp sin placa (igual que private.vehicle_label).
    expect(vehicleLabel({ make: "Mazda", model: "3", year: 2021, plate: null })).toBe(
      "Mazda 3 2021 · sin placa",
    );
    const o = order({
      items: [
        {
          id: "1",
          name: "Lavado",
          quantity: 1,
          status: "terminada",
          mine: true,
          startedAt: null,
          finishedAt: null,
        },
        {
          id: "2",
          name: "Aspirado",
          quantity: 1,
          status: "pendiente",
          mine: false,
          startedAt: null,
          finishedAt: null,
        },
      ],
    });
    expect(orderProgress(o)).toEqual({ done: 1, total: 2 });
    expect(orderStateOf({ status: "autorizada" })).toBe("por_empezar");
    expect(orderStateOf({ status: "en_proceso" })).toBe("trabajando");
    expect(orderStateOf({ status: "entregada" })).toBe("terminada");
  });

  it("ordena lo pendiente primero y lo terminado al final", () => {
    const sorted = sortOrders([
      order({ id: "t", status: "terminada" }),
      order({ id: "p", status: "autorizada", scheduledAt: "2026-10-15T14:00:00Z" }),
      order({ id: "w", status: "en_proceso" }),
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["w", "p", "t"]);
  });

  it("resumen del día y hora de la tarjeta", () => {
    expect(myWorkSummary({ orders: [order({ status: "terminada" }), order({})], appointments: [] })).toBe(
      "1 por hacer · 1 terminada",
    );
    expect(myWorkSummary({ orders: [], appointments: [{} as never, {} as never] })).toBe(
      "0 por hacer · 0 terminadas · 2 citas",
    );
    expect(orderTimeLabel(order({}), "America/Mexico_City")).toMatch(/9:00/);
    expect(orderTimeLabel(order({ promisedAt: "2026-10-15T18:00:00Z" }), "America/Mexico_City")).toMatch(
      /^Entrega 12:00/,
    );
  });
});

describe("Mi semana del operador", () => {
  it("lunes a domingo con trabajos, pago por trabajo, total y día de pago (martes)", async () => {
    const { presentMyWorkWeek, weekdayLabel } = await import("./work");
    expect(weekdayLabel("2026-10-27")).toBe("mar 27 oct");
    const v = presentMyWorkWeek(
      {
        weekStart: "2026-10-26",
        weekEnd: "2026-11-01",
        payDay: "2026-11-03",
        today: "2026-10-28",
        total: 157,
        items: [
          {
            itemId: "i1",
            orderId: "o1",
            folio: "A-01-000123",
            service: "Lavado",
            quantity: 1,
            finishedAt: "2026-10-26T17:30:00Z",
            day: "2026-10-26",
            vehicle: { make: "Mazda", model: "3", plate: "ABC1234" },
            commission: 57,
          },
          {
            itemId: "i2",
            orderId: "o2",
            folio: "A-01-000124",
            service: "Encerado",
            quantity: 2,
            finishedAt: "2026-10-28T20:00:00Z",
            day: "2026-10-28",
            vehicle: { make: "Kia", model: "Rio", plate: null },
            commission: 100,
          },
          {
            itemId: "i3",
            orderId: "o3",
            folio: "A-01-000125",
            service: "Llantas",
            quantity: 1,
            finishedAt: "2026-10-28T21:00:00Z",
            day: "2026-10-28",
            vehicle: { make: "Kia", model: "Rio", plate: null },
            commission: 0,
          },
        ],
      },
      "America/Mexico_City",
    );
    expect(v.range).toBe("lun 26 oct – dom 1 nov");
    expect(v.payDay).toBe("Se paga el mar 3 nov");
    expect(v.count).toBe(3);
    expect(v.total).toBe("$157.00");
    expect(v.days.map((d) => d.count)).toEqual([1, 0, 2, 0, 0, 0, 0]);
    expect(v.days[2]!.isToday).toBe(true);
    expect(v.days[0]!.items[0]).toEqual({
      id: "i1",
      title: "Lavado",
      detail: "Mazda 3 · ABC1234 · A-01-000123 · 11:30 a.m.",
      pay: "$57.00",
    });
    expect(v.days[2]!.items.map((i) => [i.title, i.pay])).toEqual([
      ["2 × Encerado", "$100.00"],
      ["Llantas", "Sin comisión configurada"],
    ]);
  });
});
