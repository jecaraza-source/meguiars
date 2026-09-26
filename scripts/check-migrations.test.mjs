import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, validateMigrations } from "./check-migrations.mjs";

const A = "20260922000000_foundation.sql";
const B = "20260923000000_multicenter_security.sql";
const C = "20260926000000_auth_session.sql";

describe("validateMigrations", () => {
  it("las migraciones del repo cumplen las reglas", () => {
    const head = readdirSync(join(__dirname, "..", MIGRATIONS_DIR));
    expect(validateMigrations({ head })).toEqual([]);
  });

  it("rechaza nombres fuera de formato y versiones repetidas", () => {
    const errors = validateMigrations({
      head: [A, "20260922000000_otra.sql", "2026_mal.sql", "20260930000000_Mayus.sql"],
    });
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toMatch(/repetida/);
    expect(errors.join("\n")).toMatch(/2026_mal\.sql/);
    expect(errors.join("\n")).toMatch(/Mayus/);
  });

  it("una migración de la base no se edita, renombra ni borra", () => {
    const errors = validateMigrations({ head: [A, C], base: [A, B], changed: [B] });
    expect(errors).toEqual([expect.stringMatching(/^20260923000000_multicenter_security\.sql: ya existe/)]);
  });

  it("una migración nueva va después de la última de la base", () => {
    expect(validateMigrations({ head: [A, B, C], base: [A, B] })).toEqual([]);
    const errors = validateMigrations({
      head: [A, "20260922120000_tarde.sql", C],
      base: [A, C],
    });
    expect(errors).toEqual([expect.stringMatching(/mayor que la última de la base \(20260926000000\)/)]);
  });

  it("sin base sólo valida formato y unicidad", () => {
    expect(validateMigrations({ head: [C, A], base: null, changed: [A] })).toEqual([]);
  });
});
