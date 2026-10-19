import { describe, expect, it } from "vitest";
import {
  previousReportPeriod,
  reportCentersText,
  reportDue,
  reportPeriod,
  reportSubject,
  splitRecipients,
  renderReportEmail,
  type PresentedCard,
  type PresentedCell,
  type ReportDelivery,
} from "../index";

const delivery = (over: Partial<ReportDelivery> = {}): ReportDelivery => ({
  id: "d1",
  organizationId: "o",
  subscriptionId: "s1",
  subscriptionName: "Diario",
  frequency: "diario",
  source: "cron",
  periodFrom: "2026-10-18",
  periodTo: "2026-10-18",
  recipients: ["dir@meguiars.mx"],
  status: "enviado",
  providerMessageId: "m1",
  error: null,
  requestedBy: null,
  createdAt: "2026-10-19T13:00:00Z",
  ...over,
});

describe("periodo del reporte (último cerrado)", () => {
  it("diario: el día anterior", () => {
    expect(reportPeriod("diario", "2026-10-19")).toEqual({ from: "2026-10-18", to: "2026-10-18" });
    expect(reportPeriod("diario", "2026-03-01")).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });

  it("semanal: lunes a domingo de la semana anterior, cualquier día que corra", () => {
    // 2026-10-19 es lunes.
    expect(reportPeriod("semanal", "2026-10-19")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(reportPeriod("semanal", "2026-10-21")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    // Domingo: la semana en curso aún no cierra.
    expect(reportPeriod("semanal", "2026-10-25")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(reportPeriod("semanal", "2026-10-26")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("quincenal: 1–15 desde el 16; 16–fin de mes desde el 1", () => {
    expect(reportPeriod("quincenal", "2026-10-16")).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(reportPeriod("quincenal", "2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(reportPeriod("quincenal", "2026-11-01")).toEqual({ from: "2026-10-16", to: "2026-10-31" });
    expect(reportPeriod("quincenal", "2026-03-15")).toEqual({ from: "2026-02-16", to: "2026-02-28" });
    expect(reportPeriod("quincenal", "2026-01-02")).toEqual({ from: "2025-12-16", to: "2025-12-31" });
  });

  it("mensual: el mes anterior completo (cruza año y bisiesto)", () => {
    expect(reportPeriod("mensual", "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(reportPeriod("mensual", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(reportPeriod("mensual", "2028-03-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("periodo anterior para comparar", () => {
  it("equivalente según la frecuencia", () => {
    expect(previousReportPeriod("diario", { from: "2026-10-01", to: "2026-10-01" })).toEqual({
      from: "2026-09-30",
      to: "2026-09-30",
    });
    expect(previousReportPeriod("semanal", { from: "2026-10-12", to: "2026-10-18" })).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    });
    expect(previousReportPeriod("quincenal", { from: "2026-10-16", to: "2026-10-31" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
    });
    expect(previousReportPeriod("quincenal", { from: "2026-03-01", to: "2026-03-15" })).toEqual({
      from: "2026-02-16",
      to: "2026-02-28",
    });
    expect(previousReportPeriod("mensual", { from: "2026-01-01", to: "2026-01-31" })).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("¿toca enviar?", () => {
  const sub = { id: "s1", active: true, frequency: "diario" as const };

  it("envía el último periodo cerrado si no se ha enviado por la vía automática", () => {
    expect(reportDue(sub, "2026-10-19", [])).toEqual({ from: "2026-10-18", to: "2026-10-18" });
    expect(reportDue(sub, "2026-10-19", [delivery()])).toBeNull();
  });

  it("un fallo, un «Enviar ahora» u otra programación no cuentan como enviado", () => {
    expect(reportDue(sub, "2026-10-19", [delivery({ status: "fallido", error: "x" })])).not.toBeNull();
    expect(reportDue(sub, "2026-10-19", [delivery({ source: "manual" })])).not.toBeNull();
    expect(reportDue(sub, "2026-10-19", [delivery({ subscriptionId: "s2" })])).not.toBeNull();
  });

  it("pausada no se envía", () => {
    expect(reportDue({ ...sub, active: false }, "2026-10-19", [])).toBeNull();
  });
});

describe("presentación", () => {
  it("asunto con nombre y periodo", () => {
    expect(reportSubject("Resumen semanal", { from: "2026-10-12", to: "2026-10-18" })).toContain(
      "Resumen semanal",
    );
  });

  it("separa correos por coma, punto y coma, espacio o renglón, sin repetidos", () => {
    expect(splitRecipients(" Dir@Meguiars.mx, socio@correo.com;\ndir@meguiars.mx  otro@x.mx ")).toEqual([
      "dir@meguiars.mx",
      "socio@correo.com",
      "otro@x.mx",
    ]);
    expect(splitRecipients("  ")).toEqual([]);
  });

  it("centros del reporte", () => {
    expect(reportCentersText(null, {})).toBe("Todos los centros");
    expect(reportCentersText(["a", "b"], { a: "CDMX" })).toBe("CDMX, Centro sin acceso");
  });
});

describe("correo del reporte", () => {
  const palette = {
    background: "bg",
    surface: "sf",
    foreground: "fg",
    muted: "mu",
    border: "bd",
    brand: "br",
    brandForeground: "bf",
    accent: "ac",
    success: "OK",
    danger: "BAD",
    dangerSurface: "BADBG",
  };
  const sizes = {
    space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 },
    radius: { md: 8 },
    content: 1024,
  };
  const cell = (
    key: string,
    label: string,
    value: string,
    over: Partial<PresentedCell> = {},
  ): PresentedCell => ({
    key,
    label,
    value,
    raw: 0,
    trend: { text: "▲ 10.0 %", tone: "good", hint: "" },
    alert: null,
    href: "/direccion",
    path: { cardId: "ventas" },
    ...over,
  });
  const card = (over: Partial<PresentedCard> = {}): PresentedCard => ({
    id: "ventas",
    name: "Ventas <netas>",
    unit: "currency",
    definition: "",
    formula: "",
    status: "ok",
    message: null,
    consolidated: cell("consolidado", "Consolidado", "$10,000.00"),
    centers: [
      cell("a", "CDMX", "$6,000.00"),
      cell("b", "MTY", "$4,000.00", {
        trend: { text: "▼ 5.0 %", tone: "bad", hint: "" },
        alert: { text: "Debajo del mínimo $5,000.00 · centro", kind: "bajo" },
      }),
    ],
    alerts: 1,
    notes: [],
    href: "/direccion",
    path: { cardId: "ventas" },
    ...over,
  });
  const input = {
    name: "Resumen semanal",
    frequency: "semanal" as const,
    period: { from: "2026-10-12", to: "2026-10-18" },
    previous: { from: "2026-10-05", to: "2026-10-11" },
    centers: [
      { id: "a", name: "CDMX" },
      { id: "b", name: "MTY" },
    ],
    cards: [card(), card({ id: "mrr", name: "MRR", status: "forbidden", consolidated: null, centers: [] })],
    boardUrl: "https://app.mx/direccion?periodo=personalizado&desde=2026-10-12&hasta=2026-10-18",
  };

  it("lleva consolidado, columnas por centro, tendencia con color, alertas y enlace", () => {
    const { html, text } = renderReportEmail(input, palette, sizes);
    expect(html).toContain("REPORTE SEMANAL");
    expect(html).toContain("Ventas &lt;netas&gt;");
    expect(html).not.toContain("<netas>");
    expect(html).toContain(">CDMX</th>");
    expect(html).toContain("color:OK");
    expect(html).toContain("color:BAD");
    expect(html).toContain("background:BADBG");
    expect(html).toContain("Alertas de umbral (1)");
    expect(html).toContain("Sin permiso: MRR");
    expect(html).toContain('href="https://app.mx/direccion?periodo=personalizado&amp;desde=2026-10-12');
    expect(text).toContain("- Ventas <netas>: $10,000.00 (▲ 10.0 %)");
    expect(text).toContain("MTY: $4,000.00 (▼ 5.0 %)");
    expect(text).toContain("Tablero corporativo: https://app.mx/direccion");
  });

  it("con muchos centros sólo manda el consolidado; sin tarjetas avisa «Sin datos»", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, name: `Centro ${i}` }));
    const { html } = renderReportEmail({ ...input, centers: many }, palette, sizes);
    expect(html).not.toContain(">Centro 0</th>");
    expect(html).toContain("7 centros (consolidado");
    const empty = renderReportEmail({ ...input, cards: [], boardUrl: null }, palette, sizes);
    expect(empty.html).toContain("Sin datos para este periodo.");
    expect(empty.html).not.toContain("Abrir el Tablero");
  });
});
