import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KPI_CATALOG } from "./catalog";

/** La documentación del módulo incluye la definición legible de cada KPI. */
describe("documentación de KPIs", () => {
  const doc = readFileSync(join(__dirname, "../../../../docs/modules/kpis.md"), "utf8");
  it.each(KPI_CATALOG.map((k) => [k.id, k] as const))("%s está documentado con su definición", (_, k) => {
    expect(doc).toContain(`#### ${k.name} (\`${k.id}\`)`);
    expect(doc).toContain(k.definition);
  });
});
