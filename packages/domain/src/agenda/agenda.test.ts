import { describe, expect, it } from "vitest";
import { canReschedule, canTransition, type AppointmentListItem } from "./agenda";
import { daySummary, presentAppointment, presentOrderDraft, statusActions } from "./presenter";
import { addDays, todayIn, utcToZoned, zonedToUtc } from "./zoned-time";

const item: AppointmentListItem = {
  id: "a1",
  startsAt: "2026-10-01T16:00:00.000Z",
  endsAt: "2026-10-01T18:40:00.000Z",
  durationMinutes: 160,
  status: "programada",
  isWalkIn: false,
  conflictOverride: true,
  clientId: "c",
  clientName: "José Pérez",
  clientPhone: "+525512345678",
  vehicleId: "v",
  vehicleLabel: "Mazda 3 2021 · ABC1234",
  bayId: "b",
  bayName: "Bahía 1",
  technicianId: null,
  technicianName: null,
  services: ["Lavado", "Pulido"],
  notes: null,
  serviceOrderId: null,
};

describe("zona horaria del centro", () => {
  it("hora local ↔ UTC en Ciudad de México (UTC−6, sin horario de verano)", () => {
    expect(zonedToUtc("2026-10-01", "10:00", "America/Mexico_City")).toBe("2026-10-01T16:00:00.000Z");
    expect(utcToZoned("2026-10-02T05:30:00Z", "America/Mexico_City")).toEqual({
      date: "2026-10-01",
      time: "23:30",
    });
  });

  it("respeta el horario de verano donde aplica (Nueva York)", () => {
    expect(zonedToUtc("2026-07-01", "10:00", "America/New_York")).toBe("2026-07-01T14:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "10:00", "America/New_York")).toBe("2026-12-01T15:00:00.000Z");
  });

  it("hoy en el centro y aritmética de días", () => {
    expect(todayIn("America/Mexico_City", new Date("2026-10-02T03:00:00Z"))).toBe("2026-10-01");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("rechaza zona u hora inválidas", () => {
    expect(() => zonedToUtc("2026-10-01", "10:00", "Mars/Base")).toThrow(RangeError);
    expect(() => zonedToUtc("2026-10-01", "10am", "America/Mexico_City")).toThrow(RangeError);
  });
});

describe("estatus de citas", () => {
  it("transiciones válidas y reprogramación", () => {
    expect(canTransition("programada", "recibida")).toBe(true);
    expect(canTransition("programada", "terminada")).toBe(false);
    expect(canTransition("cancelada", "recibida")).toBe(false);
    expect(canReschedule("recibida")).toBe(true);
    expect(canReschedule("en_servicio")).toBe(false);
  });

  it("acciones disponibles; cancelar y no_show piden motivo", () => {
    expect(statusActions("programada")).toEqual([
      { to: "recibida", label: "Recibir", needsReason: false, destructive: false },
      { to: "cancelada", label: "Cancelar", needsReason: true, destructive: true },
      { to: "no_show", label: "No se presentó", needsReason: true, destructive: true },
    ]);
    expect(statusActions("entregada")).toEqual([]);
  });
});

describe("presentadores", () => {
  it("cita en hora del centro con sus datos y marcas", () => {
    expect(presentAppointment(item, "America/Mexico_City")).toMatchObject({
      time: "10:00–12:40",
      endsOtherDay: false,
      services: "Lavado, Pulido",
      technician: "Sin asignar",
      status: "Programada",
      tone: "info",
      badges: ["Encimada (autorizado)"],
    });
  });

  it("resumen del día por estatus", () => {
    expect(daySummary([item, { ...item, id: "a2", status: "recibida" }, { ...item, id: "a3" }])).toEqual([
      { status: "programada", label: "Programada", count: 2 },
      { status: "recibida", label: "Recibida", count: 1 },
    ]);
  });

  it("borrador de OS con total", () => {
    const view = presentOrderDraft({
      appointmentId: "a1",
      detailCenterId: "A",
      clientId: "c",
      vehicleId: "v",
      lines: [
        {
          serviceId: "s1",
          serviceCode: "LAV",
          serviceName: "Lavado",
          revenueEngine: "recurrente",
          unitPrice: 250,
          unitDirectCost: 80,
          durationMinutes: 40,
        },
        {
          serviceId: "s2",
          serviceCode: "POL",
          serviceName: "Pulido",
          revenueEngine: "valor_medio",
          unitPrice: 2800,
          unitDirectCost: 900,
          durationMinutes: 120,
        },
      ],
    });
    expect(view.lines.map((l) => l.name)).toEqual(["Lavado · LAV", "Pulido · POL"]);
    expect(view.total).toMatch(/3,050\.00/);
  });
});
