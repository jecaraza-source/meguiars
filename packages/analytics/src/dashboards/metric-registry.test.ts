import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { METRIC_CATALOG } from "./catalog";

/**
 * Paridad del registro de métricas: el estado de public.metric_registry tras
 * aplicar todas las migraciones (llamadas a private.register_metric, la de
 * mayor versión gana) debe ser igual a METRIC_CATALOG. Si agregas o cambias
 * una métrica en código sin su migración (o al revés), esta prueba falla.
 */

const migrationsDir = join(__dirname, "../../../../supabase/migrations");

type Literal = string | number | boolean | null | string[];

/** Argumentos literales de una llamada SQL: 'texto' (con ''), números, booleanos y '{a,b}'. */
function parseArgs(src: string): Literal[] {
  const out: Literal[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/[\s,]/.test(c)) {
      i++;
      continue;
    }
    if (c === "'") {
      let s = "";
      i++;
      for (;;) {
        if (src[i] === "'" && src[i + 1] === "'") {
          s += "'";
          i += 2;
        } else if (src[i] === "'") {
          i++;
          break;
        } else s += src[i++];
      }
      out.push(/^\{.*\}$/.test(s) ? (s === "{}" ? [] : s.slice(1, -1).split(",")) : s);
      continue;
    }
    const m = /^(true|false|null|\d+)/.exec(src.slice(i));
    if (!m) throw new Error(`Argumento no literal en register_metric: ${src.slice(i, i + 40)}`);
    out.push(m[1] === "true" ? true : m[1] === "false" ? false : m[1] === "null" ? null : Number(m[1]));
    i += m[1]!.length;
  }
  return out;
}

function registeredMetrics() {
  const state = new Map<string, Record<string, Literal>>();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const m of sql.matchAll(/select private\.register_metric\(([\s\S]*?)\);/g)) {
      const a = parseArgs(m[1]!);
      const row = {
        id: a[0]!,
        version: a[1]!,
        name: a[2]!,
        description: a[3]!,
        unit: a[4]!,
        formula: a[5]!,
        source: a[6]!,
        sourceTables: a[7]!,
        capability: a[8]!,
        widgets: a[9]!,
        filters: a[10]!,
        breakdowns: a[11]!,
        drill: a[12]!,
      };
      const prev = state.get(row.id as string);
      if (!prev || (prev.version as number) <= (row.version as number)) state.set(row.id as string, row);
    }
  }
  return state;
}

describe("registro de métricas", () => {
  const db = registeredMetrics();

  it("cada métrica del catálogo está registrada en la base con los mismos datos", () => {
    for (const m of METRIC_CATALOG) {
      expect(db.get(m.id), `falta la migración de ${m.id}`).toEqual({
        id: m.id,
        version: m.version,
        name: m.name,
        description: m.description,
        unit: m.unit,
        formula: m.formula,
        source: m.source,
        sourceTables: [...m.sourceTables],
        capability: m.capability,
        widgets: [...m.widgets],
        filters: [...m.filters],
        breakdowns: [...m.breakdowns],
        drill: m.drill !== null,
      });
    }
  });

  it("la base no registra métricas que el código no sabe calcular", () => {
    expect([...db.keys()].sort()).toEqual(METRIC_CATALOG.map((m) => m.id).sort());
  });
});
