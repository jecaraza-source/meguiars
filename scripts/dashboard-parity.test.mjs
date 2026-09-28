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

describe("paridad web/móvil de los tableros", () => {
  it.each(["widgetConfig", "centersWith", "canManageDashboards", "loadDashboardView"])(
    "%s es idéntico en web y móvil",
    (name) => {
      expect(declaration(web, name)).not.toBeNull();
      expect(declaration(mobile, name)).toBe(declaration(web, name));
    },
  );
});
