import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createAlertsRepository } from "./alerts";

const O = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000000";
const R = "bbbbbbbb-0000-4000-8000-000000000000";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("repositorio de alertas", () => {
  it("regla: valida y llama save_alert_rule (corporativo sin centros)", async () => {
    const { client, rpc } = fake({ data: null, error: { code: "42501", message: "Sin permiso" } });
    const repo = createAlertsRepository(client);
    const bad = await repo.saveRule({
      organizationId: O,
      id: null,
      version: null,
      name: "x",
      description: null,
      metricId: "pnl.revenue",
      channel: null,
      condition: "below",
      threshold: 1,
      period: "dia",
      scopeKind: "corporativo",
      centerIds: null,
      severity: "critica",
      cooldownMinutes: 60,
      active: true,
      reason: "Motivo válido",
    });
    expect(bad.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const r = await repo.saveRule({
      organizationId: O,
      id: null,
      version: null,
      name: "Caída de ventas",
      description: null,
      metricId: "pnl.revenue",
      channel: null,
      condition: "drop_pct",
      threshold: 15,
      period: "mes_en_curso",
      scopeKind: "corporativo",
      centerIds: [A],
      severity: "critica",
      cooldownMinutes: 60,
      active: true,
      reason: "Motivo válido",
    });
    expect(rpc).toHaveBeenCalledWith(
      "save_alert_rule",
      expect.objectContaining({ p_center_ids: null, p_threshold: 15 }),
    );
    expect(r).toMatchObject({ ok: false, error: { kind: "permission_denied" } });
  });

  it("resultados: payload en snake_case y resumen", async () => {
    const { client, rpc } = fake({
      data: { created: [R], updated: 1, suppressed: 0, cleared: 2 },
      error: null,
    });
    const r = await createAlertsRepository(client).recordResults("run", "rule", [
      {
        scopeKey: A,
        centerIds: [A],
        triggered: true,
        value: 660,
        previousValue: null,
        changePct: null,
        periodFrom: "2026-09-28",
        periodTo: "2026-09-28",
        previousFrom: null,
        previousTo: null,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("record_alert_results", {
      p_run_id: "run",
      p_rule_id: "rule",
      p_results: [
        {
          scope_key: A,
          center_ids: [A],
          triggered: true,
          value: 660,
          previous_value: null,
          change_pct: null,
          period_from: "2026-09-28",
          period_to: "2026-09-28",
          previous_from: null,
          previous_to: null,
        },
      ],
    });
    expect(r).toEqual({ ok: true, data: { created: [R], updated: 1, suppressed: 0, cleared: 2 } });
  });

  it("resolver exige nota antes de llamar a la base", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    expect((await createAlertsRepository(client).resolve(A, " ")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
