import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ROLES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TRANSITIONS,
  DISCOUNT_LEVEL_LIMITS,
  DISCOUNT_LEVELS,
  PAYMENT_METHODS,
  REVENUE_ENGINES,
  SALES_CHANNELS,
  SERVICE_ORDER_STATUSES,
  SERVICE_ORDER_TRANSITIONS,
} from "@meguiars/domain";
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
  "appointment_services",
  "appointments",
  "audit_log",
  "bays",
  "client_centers",
  "clients",
  "detail_centers",
  "organizations",
  "profiles",
  "role_assignments",
  "service_center_config",
  "service_order_discounts",
  "service_order_items",
  "service_order_status_history",
  "service_orders",
  "service_price_history",
  "services",
  "technicians",
  "user_detail_centers",
  "vehicles",
];

// Si falta una RPC en database.types.ts, este tipo deja de compilar la prueba.
const typedRpcs: (keyof Database["public"]["Functions"])[] = [
  "add_service_order_discount",
  "add_vehicle",
  "appointment_order_draft",
  "center_catalog",
  "client_history",
  "create_appointment",
  "create_client",
  "create_service",
  "create_service_order",
  "create_service_order_from_appointment",
  "find_client_matches",
  "link_client_to_center",
  "list_appointments",
  "list_service_orders",
  "my_detail_centers",
  "record_service_order_payment",
  "search_clients",
  "service_price_at",
  "set_active_center",
  "set_appointment_status",
  "set_center_membership",
  "set_role_assignment",
  "set_service_center_config",
  "set_service_order_item",
  "set_service_order_status",
  "set_user_disabled",
  "update_appointment",
  "update_client",
  "update_detail_center",
  "update_service",
  "update_service_order_details",
  "update_vehicle",
  "upsert_bay",
  "upsert_technician",
  "void_service_order_discount",
];

describe("paridad SQL ↔ TypeScript", () => {
  it("estatus y transiciones de citas: SQL y dominio coinciden", () => {
    const def = /create type public\.appointment_status as enum\s*\(([^)]+)\)/i.exec(allSql)?.[1];
    expect(def?.split(",").map((r) => r.trim().replace(/'/g, ""))).toEqual([...APPOINTMENT_STATUSES]);
    expect([...Constants.public.Enums.appointment_status]).toEqual([...APPOINTMENT_STATUSES]);
    const fn =
      /function private\.appointment_transition_allowed[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    const sqlPairs = [...fn.matchAll(/\('(\w+)'(?:::public\.appointment_status)?,\s*'(\w+)'/g)].map(
      (m) => `${m[1]}>${m[2]}`,
    );
    const domainPairs = Object.entries(APPOINTMENT_TRANSITIONS).flatMap(([from, tos]) =>
      tos.map((to) => `${from}>${to}`),
    );
    expect(sqlPairs.sort()).toEqual(domainPairs.sort());
  });

  it("estatus y transiciones de la OS: SQL y dominio coinciden", () => {
    const def = /create type public\.service_order_status as enum\s*\(([^)]+)\)/i.exec(allSql)?.[1];
    expect(def?.split(",").map((r) => r.trim().replace(/'/g, ""))).toEqual([...SERVICE_ORDER_STATUSES]);
    expect([...Constants.public.Enums.service_order_status]).toEqual([...SERVICE_ORDER_STATUSES]);
    const fn =
      /function private\.service_order_transition_allowed[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    const sqlPairs = [...fn.matchAll(/\('(\w+)'(?:::public\.service_order_status)?,\s*'(\w+)'/g)].map(
      (m) => `${m[1]}>${m[2]}`,
    );
    const domainPairs = Object.entries(SERVICE_ORDER_TRANSITIONS).flatMap(([from, tos]) =>
      tos.map((to) => `${from}>${to}`),
    );
    expect(sqlPairs.sort()).toEqual(domainPairs.sort());
  });

  it("canales, niveles de descuento (con sus límites) y formas de pago: SQL y dominio coinciden", () => {
    const enumOf = (name: string) =>
      new RegExp(`create type public\\.${name} as enum \\(([^)]+)\\)`, "i")
        .exec(allSql)?.[1]
        ?.split(",")
        .map((r) => r.trim().replace(/'/g, ""));
    expect(enumOf("sales_channel")).toEqual([...SALES_CHANNELS]);
    expect([...Constants.public.Enums.sales_channel]).toEqual([...SALES_CHANNELS]);
    expect(enumOf("discount_level")).toEqual([...DISCOUNT_LEVELS]);
    expect([...Constants.public.Enums.discount_level]).toEqual([...DISCOUNT_LEVELS]);
    const levels =
      /function private\.discount_required_level[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    const limits = [...levels.matchAll(/p_percent <= (\d+) then '(\w+)'/g)].map((m) => [m[2], Number(m[1])]);
    expect(limits).toEqual([
      ["operador", DISCOUNT_LEVEL_LIMITS.operador],
      ["encargado", DISCOUNT_LEVEL_LIMITS.encargado],
    ]);
    const pay = /p_method not in \(([^)]+)\)/.exec(allSql)?.[1];
    expect(pay?.split(",").map((r) => r.trim().replace(/'/g, ""))).toEqual([...PAYMENT_METHODS]);
  });

  it("los motores de ingreso del dominio coinciden con el enum revenue_engine", () => {
    const def = /create type public\.revenue_engine as enum \(([^)]+)\)/i.exec(allSql)?.[1];
    expect(def?.split(",").map((r) => r.trim().replace(/'/g, ""))).toEqual([...REVENUE_ENGINES]);
    expect([...Constants.public.Enums.revenue_engine]).toEqual([...REVENUE_ENGINES]);
  });

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
