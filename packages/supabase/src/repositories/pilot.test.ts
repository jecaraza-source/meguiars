import { describe, expect, it } from "vitest";
import { toCenterReadiness, toPilotDay } from "./pilot";

describe("repositorio del piloto", () => {
  it("convierte el checklist e ignora puntos desconocidos o estados raros", () => {
    const r = toCenterReadiness({
      center: {
        id: "c",
        organization_id: "o",
        code: "N-01",
        name: "Nuevo",
        timezone: "America/Monterrey",
        active: true,
      },
      ready: false,
      items: [
        { key: "equipo", required: true, status: "missing", count: 0, detail: "0 encargados" },
        { key: "futuro", required: true, status: "ok", count: 1, detail: "" },
        { key: "bahias", required: true, status: "???", count: "2", detail: null },
      ],
    });
    expect(r.center).toMatchObject({ organizationId: "o", code: "N-01" });
    expect(r.items).toEqual([
      { key: "equipo", required: true, status: "missing", count: 0, detail: "0 encargados" },
      { key: "bahias", required: true, status: "missing", count: 2, detail: "" },
    ]);
  });

  it("convierte las métricas diarias (numéricos de Postgres como texto)", () => {
    expect(
      toPilotDay({
        detail_center_id: "c",
        day: "2026-09-30",
        active_users: 3,
        orders_created: "4",
        orders_delivered: 2,
        orders_cancelled: 1,
        revenue: "1000.00",
        cycle_minutes_avg: null,
        promised_delivered: 2,
        on_time_delivered: 1,
        appointments: 0,
        cash_closings: 1,
        cash_difference: "-20.00",
        cash_difference_abs: "20.00",
        memberships_sold: 0,
        membership_revenue: "0",
        errors: 2,
      }),
    ).toMatchObject({
      ordersCreated: 4,
      revenue: 1000,
      cycleMinutesAvg: null,
      cashDifference: -20,
      errors: 2,
    });
  });
});
