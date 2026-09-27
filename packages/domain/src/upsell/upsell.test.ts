import { describe, expect, it } from "vitest";
import { can } from "../roles";
import { presentRule, presentSuggestion } from "./presenter";
import { acceptanceScore, ruleState, upsellAddsLines, upsellStage } from "./upsell";

describe("recomendaciones de venta", () => {
  it("etapa: diagnóstico antes de trabajar, cierre hasta entregar", () => {
    expect(upsellStage("abierta")).toBe("diagnostico");
    expect(upsellStage("autorizada")).toBe("diagnostico");
    expect(upsellStage("en_proceso")).toBe("cierre");
    expect(upsellStage("terminada")).toBe("cierre");
    expect(upsellStage("entregada")).toBeNull();
    expect(upsellStage("cancelada")).toBeNull();
    expect(upsellAddsLines("terminada")).toBe(false);
    expect(upsellAddsLines("pausada")).toBe(true);
  });

  it("ranking: tasa de aceptación suavizada", () => {
    expect(acceptanceScore(0, 0)).toBe(0.5);
    expect(acceptanceScore(3, 4)).toBe(0.6667);
    expect(acceptanceScore(0, 8)).toBe(0.1);
  });

  it("estado de la regla: inactiva manda; programada y vencida por fechas", () => {
    const r = { active: true, startsOn: "2026-10-01", endsOn: "2026-10-31" };
    expect(ruleState(r, "2026-09-30")).toBe("programada");
    expect(ruleState(r, "2026-10-31")).toBe("vigente");
    expect(ruleState(r, "2026-11-01")).toBe("vencida");
    expect(ruleState({ ...r, endsOn: null }, "2030-01-01")).toBe("vigente");
    expect(ruleState({ ...r, active: false }, "2026-10-10")).toBe("inactiva");
  });

  it("presentación explicable de la sugerencia y de la regla", () => {
    const s = presentSuggestion({
      offerId: "o",
      ruleId: "r",
      stage: "diagnostico",
      ruleName: "Lavado → descontaminación",
      pitch: "Deja la pintura lista",
      sourceServiceName: "Lavado",
      targetKind: "servicio",
      targetServiceId: "s",
      targetPlanId: null,
      targetName: "Descontaminación",
      price: 650,
      priority: 90,
      acceptanceRate: 0.4,
      offeredCount: 8,
    });
    expect(s).toMatchObject({
      title: "Descontaminación · $650.00",
      why: "Porque la OS incluye Lavado · 40 % aceptación",
    });
    const r = presentRule(
      {
        id: "r",
        organizationId: "o",
        name: "Aromatizante",
        sourceServiceId: null,
        sourceServiceName: null,
        targetServiceId: "a",
        targetPlanId: null,
        targetName: "Aromatizante",
        stage: "cierre",
        priority: 40,
        pitch: "x",
        channels: ["b2c"],
        centerIds: null,
        minOrderTotal: null,
        startsOn: "2026-10-01",
        endsOn: null,
        active: false,
      },
      "2026-10-02",
    );
    expect(r).toMatchObject({ flow: "Cualquier OS → Aromatizante", state: "Inactiva", stage: "Cierre" });
  });

  it("permisos: reglas sólo admin; indicadores para dirección, comercial y contador", () => {
    expect(can(["admin_socio"], "upsell.manage")).toBe(true);
    expect(can(["encargado"], "upsell.manage")).toBe(false);
    expect(can(["contador"], "upsell.read")).toBe(true);
    expect(can(["operador_recepcion"], "upsell.read")).toBe(false);
  });
});
