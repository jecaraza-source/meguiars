import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROLES } from "@meguiars/domain";
import { describe, expect, it } from "vitest";
import { Constants } from "./database.types";

const migrationsDir = join(__dirname, "../../../supabase/migrations");
const allSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

describe("paridad SQL ↔ TypeScript", () => {
  it("los roles del dominio coinciden con el enum app_role de la migración", () => {
    const match = /create type public\.app_role as enum \(([^)]+)\)/i.exec(allSql);
    const sqlRoles = match?.[1]?.split(",").map((r) => r.trim().replace(/'/g, ""));
    expect(sqlRoles).toEqual([...APP_ROLES]);
    expect([...Constants.public.Enums.app_role]).toEqual([...APP_ROLES]);
  });

  it("cada RPC tipada existe en las migraciones", () => {
    for (const fn of ["update_detail_center", "set_center_membership"]) {
      expect(allSql).toContain(`create function public.${fn}(`);
    }
  });
});
