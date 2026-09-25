import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROLES } from "@meguiars/domain";
import { describe, expect, it } from "vitest";
import { Constants, type Database } from "./database.types";

const migrationsDir = join(__dirname, "../../../supabase/migrations");
const allSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

/** Tablas de public vigentes tras aplicar todas las migraciones en orden. */
function currentTables(): string[] {
  const tables = new Set<string>();
  const re =
    /create table public\.(\w+)|alter table public\.(\w+) rename to (\w+)|drop table public\.(\w+)/gi;
  for (const m of allSql.matchAll(re)) {
    if (m[1]) tables.add(m[1]);
    if (m[2] && m[3]) {
      tables.delete(m[2]);
      tables.add(m[3]);
    }
    if (m[4]) tables.delete(m[4]);
  }
  return [...tables].sort();
}

// Nombres de tabla tipados; si falta alguna, este tipo deja de compilar la prueba.
const typedTables: (keyof Database["public"]["Tables"])[] = [
  "audit_log",
  "detail_centers",
  "organizations",
  "profiles",
  "role_assignments",
  "user_detail_centers",
];

describe("paridad SQL ↔ TypeScript", () => {
  it("los roles del dominio coinciden con la definición vigente del enum app_role", () => {
    const defs = [...allSql.matchAll(/create type public\.app_role(?:_v2)? as enum \(([^)]+)\)/gi)];
    const sqlRoles = defs
      .at(-1)?.[1]
      ?.split(",")
      .map((r) => r.trim().replace(/'/g, ""));
    expect(sqlRoles).toEqual([...APP_ROLES]);
    expect([...Constants.public.Enums.app_role]).toEqual([...APP_ROLES]);
  });

  it("las tablas tipadas son exactamente las tablas vigentes de las migraciones", () => {
    expect(currentTables()).toEqual([...typedTables].sort());
  });

  it("cada RPC tipada existe en las migraciones", () => {
    for (const fn of [
      "update_detail_center",
      "set_center_membership",
      "set_role_assignment",
      "my_detail_centers",
    ]) {
      expect(allSql).toContain(`create function public.${fn}(`);
    }
  });
});
