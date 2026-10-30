import { describe, expect, it } from "vitest";
import {
  commercialAiPrompt,
  COMMERCIAL_AI_MAX_ITEMS,
  normalizeCommercialAiContent,
  presentCommercialAiReport,
  type CommercialReportSnapshot,
} from "./ai-report";

const snapshot: CommercialReportSnapshot = {
  periodLabel: "Últimos 30 días",
  from: "2026-10-01",
  to: "2026-10-30",
  centers: ["Centro Polanco"],
  kpis: [{ name: "Conversión prospecto → reserva", formula: "reservas / prospectos", value: "42 %" }],
  bySource: [],
  byOwner: [],
  byCenter: [],
  losses: [{ label: "Precio", count: 3 }],
};

describe("reporte comercial con IA", () => {
  it("manda las cifras tal cual y fija las reglas en el system", () => {
    const p = commercialAiPrompt(snapshot);
    expect(p.user).toContain('"value":"42 %"');
    expect(p.system).toContain("No calcules KPIs nuevos");
    // El system no cambia con los datos (se puede cachear).
    expect(commercialAiPrompt({ ...snapshot, periodLabel: "Otro" }).system).toBe(p.system);
  });

  it("recorta listas y textos a lo que guarda la base", () => {
    const many = Array.from({ length: 9 }, (_, i) => ` punto ${i} `);
    const c = normalizeCommercialAiContent({
      summary: "  ok ",
      highlights: many,
      risks: ["", "x"],
      actions: [],
    });
    expect(c.summary).toBe("ok");
    expect(c.highlights).toHaveLength(COMMERCIAL_AI_MAX_ITEMS);
    expect(c.highlights[0]).toBe("punto 0");
    expect(c.risks).toEqual(["x"]);
  });

  it("presenta fecha en la zona del centro y el estado", () => {
    const base = {
      id: "r",
      detailCenterId: "c",
      periodLabel: "Últimos 7 días",
      periodFrom: "2026-10-24",
      periodTo: "2026-10-30",
      scopeLabel: "Centro Polanco",
      error: "IA caída",
      model: null,
      createdAt: "2026-10-30T18:05:00Z",
      summary: "",
      highlights: [],
      risks: [],
      actions: [],
    };
    const r = presentCommercialAiReport({ ...base, status: "fallido" }, "America/Mexico_City");
    expect(r.createdLabel).toBe("2026-10-30 12:05");
    expect(r.statusLabel).toBe("No se pudo generar: IA caída");
    expect(presentCommercialAiReport({ ...base, status: "listo" }, "UTC").statusLabel).toBeNull();
  });
});
