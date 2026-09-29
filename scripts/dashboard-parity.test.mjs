import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tableros (D1): web y móvil arman la vista con el MISMO código (una lectura
 * de hechos + el servicio de métricas de @meguiars/analytics), así cada KPI
 * vale lo mismo en ambas apps. Si alguien cambia uno sin el otro, esto falla.
 */
const root = join(__dirname, "..");
const web = readFileSync(join(root, "apps/web/src/lib/dashboards.ts"), "utf8");
const mobile = readFileSync(join(root, "apps/mobile/src/lib/dashboards.ts"), "utf8");

/** Declaración exportada completa (hasta la llave de cierre en la columna 0). */
function declaration(src, name) {
  const start = src.search(new RegExp(`export (?:async function|function|const) ${name}\\b`));
  if (start < 0) return null;
  const end = src.indexOf("\n}", start);
  const semi = src.indexOf(");\n", start);
  return src.slice(start, name === "widgetConfig" || name === "canManageDashboards" ? semi : end);
}

const webAlerts = readFileSync(join(root, "apps/web/src/lib/alerts.ts"), "utf8");
const mobileAlerts = readFileSync(join(root, "apps/mobile/src/lib/alerts.ts"), "utf8");
const webDay = readFileSync(join(root, "apps/web/src/lib/day.ts"), "utf8");
const mobileDay = readFileSync(join(root, "apps/mobile/src/lib/day.ts"), "utf8");
const webCorporate = readFileSync(join(root, "apps/web/src/lib/corporate.ts"), "utf8");
const mobileCorporate = readFileSync(join(root, "apps/mobile/src/lib/corporate.ts"), "utf8");

describe("paridad web/móvil de los tableros", () => {
  it.each(["widgetConfig", "centersWith", "canManageDashboards", "loadDashboardView", "kpiDefinition"])(
    "%s es idéntico en web y móvil",
    (name) => {
      expect(declaration(web, name)).not.toBeNull();
      expect(declaration(mobile, name)).toBe(declaration(web, name));
    },
  );
});

describe("paridad web/móvil del tablero corporativo (D3)", () => {
  it.each(["CORPORATE_SOURCES", "corporateScope", "loadCorporateView", "loadCorporateDrill"])(
    "%s es idéntico en web y móvil",
    (name) => {
      expect(declaration(webCorporate, name)).not.toBeNull();
      expect(declaration(mobileCorporate, name)).toBe(declaration(webCorporate, name));
    },
  );
});

describe("paridad web/móvil de alertas (D4)", () => {
  it.each(["alertsScope", "loadAlertsInbox", "loadAlertDetail", "loadAlertRules", "evaluateAlertsNow"])(
    "%s es idéntico en web y móvil",
    (name) => {
      expect(declaration(webAlerts, name)).not.toBeNull();
      expect(declaration(mobileAlerts, name)).toBe(declaration(webAlerts, name));
    },
  );
});

describe("paridad web/móvil de Operación del día y Resumen financiero", () => {
  it.each(["loadDayView", "loadFinanceSummary"])("%s es idéntico en web y móvil", (name) => {
    expect(declaration(webDay, name)).not.toBeNull();
    expect(declaration(mobileDay, name)).toBe(declaration(webDay, name));
  });
});
