import { describe, expect, it } from "vitest";
import {
  agendaFilterSchema,
  appointmentFormSchema,
  createAppointmentSchema,
  rescheduleFormSchema,
  setStatusSchema,
  toCreateAppointmentCommand,
  toUpdateAppointmentCommand,
} from "./agenda";
import { fieldErrors } from "./auth";

const CENTER = "11111111-1111-4111-8111-111111111111";
const CLIENT = "c1000000-0000-4000-8000-000000000001";
const VEHICLE = "c2000000-0000-4000-8000-000000000001";
const SERVICE = "5e000000-0000-4000-8000-000000000001";
const BAY = "ba000000-0000-4000-8000-000000000001";
const REQUEST = "20000000-0000-4000-8000-000000000001";

describe("agenda: validación compartida", () => {
  it("web (texto) y móvil producen la misma cita, con la hora del centro convertida a UTC", () => {
    const ctx = {
      detailCenterId: CENTER,
      requestId: REQUEST,
      clientId: CLIENT,
      timeZone: "America/Mexico_City",
    };
    const web = toCreateAppointmentCommand(
      appointmentFormSchema.parse({
        vehicleId: VEHICLE,
        serviceIds: [SERVICE, SERVICE],
        walkIn: false,
        date: "2026-10-01",
        time: "10:00",
        durationMinutes: "",
        bayId: BAY,
        technicianId: "",
        notes: "",
        overrideReason: "",
      }),
      ctx,
    );
    const mobile = toCreateAppointmentCommand(
      appointmentFormSchema.parse({
        vehicleId: VEHICLE,
        serviceIds: [SERVICE],
        walkIn: false,
        date: "2026-10-01",
        time: "10:00",
        bayId: BAY,
      }),
      ctx,
    );
    expect(web).toEqual(mobile);
    expect(web).toMatchObject({
      startsAt: "2026-10-01T16:00:00.000Z",
      serviceIds: [SERVICE],
      durationMinutes: undefined,
    });
    expect(createAppointmentSchema.safeParse(web).success).toBe(true);
  });

  it("cita programada exige fecha, hora, vehículo y servicio; walk-in no pide hora", () => {
    const bad = appointmentFormSchema.safeParse({
      vehicleId: "",
      serviceIds: [],
      walkIn: false,
      date: "",
      time: "",
    });
    expect(Object.keys(fieldErrors(bad.error!)).sort()).toEqual(["date", "serviceIds", "time", "vehicleId"]);
    const walkIn = appointmentFormSchema.parse({ vehicleId: VEHICLE, serviceIds: [SERVICE], walkIn: true });
    expect(
      toCreateAppointmentCommand(walkIn, {
        detailCenterId: CENTER,
        requestId: REQUEST,
        clientId: CLIENT,
        timeZone: "America/Mexico_City",
      }).startsAt,
    ).toBeUndefined();
  });

  it("override: motivo de al menos 3 caracteres", () => {
    expect(
      appointmentFormSchema.safeParse({
        vehicleId: VEHICLE,
        serviceIds: [SERVICE],
        walkIn: true,
        overrideReason: "ok",
      }).success,
    ).toBe(false);
  });

  it("reprogramar exige motivo y convierte la hora", () => {
    expect(
      rescheduleFormSchema.safeParse({
        serviceIds: [SERVICE],
        date: "2026-10-05",
        time: "11:00",
        durationMinutes: "60",
        reason: "",
      }).success,
    ).toBe(false);
    const form = rescheduleFormSchema.parse({
      serviceIds: [SERVICE],
      date: "2026-10-05",
      time: "11:00",
      durationMinutes: "60",
      reason: "Pidió otra hora",
    });
    expect(toUpdateAppointmentCommand(form, { id: REQUEST, timeZone: "America/Monterrey" }).startsAt).toBe(
      "2026-10-05T17:00:00.000Z",
    );
  });

  it("cancelar o no_show exigen motivo; los demás estatus no", () => {
    expect(setStatusSchema.safeParse({ id: REQUEST, status: "cancelada" }).success).toBe(false);
    expect(setStatusSchema.safeParse({ id: REQUEST, status: "cancelada", reason: "Reagendó" }).success).toBe(
      true,
    );
    expect(setStatusSchema.safeParse({ id: REQUEST, status: "recibida", reason: "" }).success).toBe(true);
    expect(setStatusSchema.safeParse({ id: REQUEST, status: "otra" }).success).toBe(false);
  });

  it("filtros de la agenda", () => {
    expect(agendaFilterSchema.parse({ day: "2026-10-01", status: "", bayId: "" })).toEqual({
      day: "2026-10-01",
      status: undefined,
      bayId: undefined,
      technicianId: undefined,
    });
    expect(agendaFilterSchema.safeParse({ day: "01/10/2026" }).success).toBe(false);
  });
});
