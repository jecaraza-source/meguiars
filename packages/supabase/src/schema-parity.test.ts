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
  "client_centers",
  "clients",
  "detail_centers",
  "organizations",
  "profiles",
  "role_assignments",
  "user_detail_centers",
  "vehicles",
];

// Si falta una RPC en database.types.ts, este tipo deja de compilar la prueba.
const typedRpcs: (keyof Database["public"]["Functions"])[] = [
  "add_vehicle",
  "client_history",
  "create_client",
  "find_client_matches",
  "link_client_to_center",
  "my_detail_centers",
  "search_clients",
  "set_active_center",
  "set_center_membership",
  "set_role_assignment",
  "set_user_disabled",
  "update_client",
  "update_detail_center",
  "update_vehicle",
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

  it("las RPC tipadas son exactamente las funciones públicas vigentes de las migraciones", () => {
    const fns = new Set<string>();
    for (const m of allSql.matchAll(/create function public\.(\w+)\(|drop function public\.(\w+)\(/gi)) {
      if (m[1]) fns.add(m[1]);
      if (m[2]) fns.delete(m[2]);
    }
    expect([...fns].sort()).toEqual([...typedRpcs].sort());
  });
});
