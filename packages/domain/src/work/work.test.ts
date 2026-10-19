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
