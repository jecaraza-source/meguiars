import { describe, expect, it } from "vitest";
import {
  buildUtmUrl,
  contentStatusActions,
  groupPostsByDay,
  promotionState,
  utmSlug,
  type ContentPost,
} from "./marketing";

describe("marketing", () => {
  it("utm_campaign sugerido sin acentos ni espacios", () => {
    expect(utmSlug("Lavado Manual — Octubre 2026!")).toBe("lavado_manual_octubre_2026");
    expect(utmSlug("Reel antes-después")).toBe("reel_antes-despues");
  });
  it("enlace UTM: conserva ruta y parámetros propios, reemplaza utm previos, sólo https", () => {
    expect(
      buildUtmUrl("https://meguiars.mx/lavado?ref=bio&utm_source=viejo", {
        source: "Instagram",
        medium: "paid_social",
        campaign: "lmd_oct",
        content: "Reel Antes y Después",
      }),
    ).toBe(
      "https://meguiars.mx/lavado?ref=bio&utm_source=instagram&utm_medium=paid_social&utm_campaign=lmd_oct&utm_content=reel_antes_y_despues",
    );
    expect(buildUtmUrl("http://meguiars.mx", { source: "a", medium: "b", campaign: "c" })).toBeNull();
    expect(buildUtmUrl("no es url", { source: "a", medium: "b", campaign: "c" })).toBeNull();
  });
  it("estado de la promoción por fecha, usos y activación", () => {
    const p = { active: true, startsOn: "2026-10-01", endsOn: "2026-10-31", maxUses: 2, uses: 0 };
    expect(promotionState(p, "2026-09-30")).toBe("programada");
    expect(promotionState(p, "2026-10-15")).toBe("vigente");
    expect(promotionState({ ...p, uses: 2 }, "2026-10-15")).toBe("agotada");
    expect(promotionState(p, "2026-11-01")).toBe("vencida");
    expect(promotionState({ ...p, active: false }, "2026-10-15")).toBe("inactiva");
  });
  it("flujo editorial y agrupación por día local del centro", () => {
    expect(contentStatusActions("idea")).toContain("programada");
    expect(contentStatusActions("publicada")).toEqual([]);
    const post = (id: string, plannedAt: string) => ({ id, plannedAt }) as ContentPost;
    // 03:00 UTC del 1 de octubre es 30 de septiembre en CDMX.
    const days = groupPostsByDay(
      [post("a", "2026-10-01T03:00:00Z"), post("b", "2026-10-01T18:00:00Z")],
      "America/Mexico_City",
    );
    expect(days.map((d) => [d.day, d.posts.map((p) => p.id)])).toEqual([
      ["2026-09-30", ["a"]],
      ["2026-10-01", ["b"]],
    ]);
  });
});
