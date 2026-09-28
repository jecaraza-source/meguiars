import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createDashboardRepository, toDashboardFacts } from "./dashboards";

const O = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000000";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("repositorio de tableros", () => {
  it("hechos: una sola RPC con fuentes, centros, periodo y periodicidad", async () => {
    const { client, rpc } = fake({
      data: {
        from: "2026-09-01",
        to: "2026-09-30",
        grain: "semana",
        pnl: [
          {
            detail_center_id: A,
            bucket: "2026-09-07",
            section: "ingreso",
            line: "b2c",
            dimension: "premium",
            amount: "1200.50",
            movements: 2,
          },
        ],
        payments: [
          {
            detail_center_id: A,
            bucket: "2026-09-07",
            method: "efectivo",
            method_name: "Efectivo",
            collects_cash: true,
            valid_amount: "700.00",
            valid_count: 1,
            reversed_amount: "0",
            reversed_count: 0,
            change_amount: "0",
          },
        ],
      },
      error: null,
    });
    const r = await createDashboardRepository(client).facts({
      sources: ["pnl", "payments"],
      detailCenterIds: [A],
      from: "2026-09-01",
      to: "2026-09-30",
      grain: "semana",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("dashboard_facts", {
      p_sources: ["pnl", "payments"],
      p_detail_center_ids: [A],
      p_from: "2026-09-01",
      p_to: "2026-09-30",
      p_grain: "semana",
    });
    expect(r.ok && r.data.pnl?.[0]).toEqual({
      detailCenterId: A,
      bucket: "2026-09-07",
      section: "ingreso",
      line: "b2c",
      dimension: "premium",
      amount: 1200.5,
      movements: 2,
    });
    expect(r.ok && r.data.payments?.[0]?.day).toBe("2026-09-07");
    expect(r.ok && r.data.pipeline).toBeUndefined();
  });

  it("valida el periodo antes de llamar a la base", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    const r = await createDashboardRepository(client).facts({
      sources: ["pnl"],
      detailCenterIds: [A],
      from: "2026-09-30",
      to: "2026-09-01",
      grain: "total",
    });
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("guardar: rejilla completa en snake_case; métricas fuera del patrón se rechazan", async () => {
    const { client, rpc } = fake({ data: { id: O }, error: null });
    const repo = createDashboardRepository(client);
    const bad = await repo.save({
      organizationId: O,
      requestId: O,
      name: "Tablero",
      audienceRole: null,
      centerIds: null,
      defaultRange: "mes",
      isDefault: false,
      widgets: [{ metricId: "select 1", type: "kpi", colSpan: 1, rowSpan: 1, options: {} }],
    });
    expect(bad.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await repo.save({
      organizationId: O,
      requestId: O,
      name: "Tablero",
      audienceRole: "encargado",
      centerIds: [A],
      defaultRange: "semana",
      isDefault: false,
      widgets: [
        {
          metricId: "pnl.revenue",
          type: "distribution",
          colSpan: 2,
          rowSpan: 2,
          options: { breakdown: "motor" },
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith(
      "save_dashboard",
      expect.objectContaining({
        p_request_id: O,
        p_audience_role: "encargado",
        p_widgets: [
          {
            metric_id: "pnl.revenue",
            widget_type: "distribution",
            title: null,
            col_span: 2,
            row_span: 2,
            options: { breakdown: "motor" },
          },
        ],
      }),
    );
  });

  it("el jsonb de hechos sin fuentes no inventa datos", () => {
    expect(toDashboardFacts({ from: "2026-09-01", to: "2026-09-01", grain: "total" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-01",
      grain: "total",
    });
  });
});
