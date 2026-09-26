import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ROLES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TRANSITIONS,
  CONTACT_CHANNELS,
  CRM_RULES,
  CUSTOMER_SEGMENTS,
  NEXT_VISIT_STATES,
  TASK_CHANNELS,
  TASK_KINDS,
  TASK_OUTCOMES,
  TASK_SOURCES,
  TASK_STATUSES,
  DISCOUNT_LEVEL_LIMITS,
  EVIDENCE_KINDS,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_TYPES,
  EXECUTION_EVENT_KINDS,
  INCIDENT_KINDS,
  INVENTORY_UNITS,
  ITEM_WORK_STATUSES,
  ITEM_WORK_TRANSITIONS,
  MEMBERSHIP_EVENT_KINDS,
  MEMBERSHIP_STATE_TRANSITIONS,
  MEMBERSHIP_STATES,
  MEMBERSHIP_STATUSES,
  PERIOD_MONTHS,
  PLAN_TIERS,
  REDEEM_SCOPES,
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
  "contact_preferences",
  "crm_tasks",
  "detail_centers",
  "inventory_items",
  "membership_benefits",
  "membership_events",
  "membership_plans",
  "membership_redemptions",
  "memberships",
  "organizations",
  "profiles",
  "role_assignments",
  "service_center_config",
  "service_order_consumptions",
  "service_order_discounts",
  "service_order_events",
  "service_order_evidence",
  "service_order_incidents",
  "service_order_items",
  "service_order_staff",
  "service_order_status_history",
  "service_orders",
  "service_supply_standards",
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
  "cancel_crm_task",
  "complete_crm_task",
  "appointment_order_draft",
  "center_catalog",
  "client_history",
  "create_appointment",
  "create_client",
  "create_crm_task",
  "create_membership",
  "create_service",
  "create_service_order",
  "create_service_order_from_appointment",
  "crm_customers",
  "find_client_matches",
  "generate_crm_tasks",
  "link_client_to_center",
  "list_appointments",
  "list_memberships",
  "list_service_orders",
  "membership_balance",
  "membership_metric_facts",
  "my_detail_centers",
  "record_service_order_consumption",
  "redeem_membership_benefit",
  "renew_membership",
  "register_service_order_evidence",
  "remove_service_order_evidence",
  "reschedule_crm_task",
  "report_service_order_incident",
  "resolve_service_order_incident",
  "record_service_order_payment",
  "search_clients",
  "service_price_at",
  "set_active_center",
  "set_appointment_status",
  "set_center_membership",
  "set_contact_preference",
  "set_membership_benefit",
  "set_membership_state",
  "set_role_assignment",
  "set_service_center_config",
  "set_service_order_item",
  "set_service_order_item_work",
  "set_service_order_staff",
  "set_service_order_status",
  "set_service_supply_standard",
  "set_user_disabled",
  "update_appointment",
  "update_client",
  "update_detail_center",
  "update_service",
  "update_service_order_details",
  "update_vehicle",
  "upsert_bay",
  "upsert_inventory_item",
  "upsert_membership_plan",
  "upsert_technician",
  "void_membership_redemption",
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

  it("ejecución: estatus y transiciones de línea, unidades, momentos, eventos y límites de fotos coinciden", () => {
    const listIn = (re: RegExp) =>
      re
        .exec(allSql)?.[1]
        ?.split(",")
        .map((r) =>
          r
            .trim()
            .replace(/'/g, "")
            .replace(/^array\[|\]$/g, ""),
        );
    expect(listIn(/create type public\.item_work_status as enum \(([^)]+)\)/)).toEqual([
      ...ITEM_WORK_STATUSES,
    ]);
    expect([...Constants.public.Enums.item_work_status]).toEqual([...ITEM_WORK_STATUSES]);
    const fn =
      /function private\.item_work_transition_allowed[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    const sqlPairs = [...fn.matchAll(/\('(\w+)'(?:::public\.item_work_status)?,\s*'(\w+)'/g)].map(
      (m) => `${m[1]}>${m[2]}`,
    );
    const domainPairs = Object.entries(ITEM_WORK_TRANSITIONS).flatMap(([from, tos]) =>
      tos.map((to) => `${from}>${to}`),
    );
    expect(sqlPairs.sort()).toEqual(domainPairs.sort());
    expect(listIn(/unit text not null check \(unit in \(([^)]+)\)\)/)).toEqual([...INVENTORY_UNITS]);
    expect(listIn(/kind text not null check \(kind in \(('antes'[^)]+)\)\)/)).toEqual([...EVIDENCE_KINDS]);
    expect(listIn(/kind text not null check \(kind in \(('incidencia', 'retrabajo')\)\)/)).toEqual([
      ...INCIDENT_KINDS,
    ]);
    const events = /check \(kind in \(\s*('os_inicio'[\s\S]*?'incidencia_resuelta')/.exec(allSql)?.[1] ?? "";
    expect([...events.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual([...EXECUTION_EVENT_KINDS]);
    const bucket =
      /values \('service-order-evidence', 'service-order-evidence', false, (\d+),\s*array\[([^\]]+)\]/.exec(
        allSql,
      );
    expect(Number(bucket?.[1])).toBe(EVIDENCE_MAX_BYTES);
    expect(bucket?.[2]?.split(",").map((r) => r.trim().replace(/'/g, ""))).toEqual([...EVIDENCE_MIME_TYPES]);
  });

  it("membresías: estados, estado efectivo, niveles, periodicidad, alcance, eventos y transiciones coinciden", () => {
    const listIn = (re: RegExp) =>
      re
        .exec(allSql)?.[1]
        ?.split(",")
        .map((r) => r.trim().replace(/'/g, ""));
    expect(listIn(/create type public\.membership_state as enum \(([^)]+)\)/)).toEqual([
      ...MEMBERSHIP_STATES,
    ]);
    expect([...Constants.public.Enums.membership_state]).toEqual([...MEMBERSHIP_STATES]);
    const status = /function private\.membership_status[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    expect([...status.matchAll(/(?:then|else) '(\w+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...MEMBERSHIP_STATUSES].sort(),
    );
    expect(listIn(/tier text not null check \(tier in \(([^)]+)\)\)/)).toEqual([...PLAN_TIERS]);
    expect(
      listIn(/period_months smallint not null check \(period_months in \(([^)]+)\)\)/)?.map(Number),
    ).toEqual([...PERIOD_MONTHS]);
    expect(listIn(/check \(redeem_scope in \(([^)]+)\)\)/)).toEqual([...REDEEM_SCOPES]);
    const events = /check \(kind in \(\s*('alta'[\s\S]*?'redencion_anulada')/.exec(allSql)?.[1] ?? "";
    expect([...events.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual([...MEMBERSHIP_EVENT_KINDS]);
    const fn = /function public\.set_membership_state[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    const sqlPairs = [
      ...fn.matchAll(/when m\.state (?:= '(\w+)'|in \(([^)]+)\)) and p_state = '(\w+)'/g),
    ].flatMap((m) =>
      (m[1] ? [m[1]] : m[2]!.split(",").map((x) => x.trim().replace(/'/g, ""))).map((f) => `${f}>${m[3]}`),
    );
    const domainPairs = Object.entries(MEMBERSHIP_STATE_TRANSITIONS).flatMap(([from, tos]) =>
      tos.map((to) => `${from}>${to}`),
    );
    expect(sqlPairs.sort()).toEqual(domainPairs.sort());
  });

  it("CRM: segmentos, estados de próxima visita, umbrales, canales, tipos y resultados coinciden", () => {
    const listIn = (re: RegExp) =>
      re
        .exec(allSql)?.[1]
        ?.split(",")
        .map((r) => r.trim().replace(/'/g, ""));
    const seg = /function private\.customer_segment[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    expect([...seg.matchAll(/(?:then|else) '(\w+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...CUSTOMER_SEGMENTS].sort(),
    );
    const nv = /function private\.next_visit_state[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    expect([...nv.matchAll(/then '(\w+)'|else '(\w+)'/g)].map((m) => m[1] ?? m[2]).sort()).toEqual(
      [...NEXT_VISIT_STATES].sort(),
    );
    const rules = /function private\.crm_rule[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(allSql)?.[1] ?? "";
    const sqlRules = Object.fromEntries(
      [...rules.matchAll(/when '(\w+)' then (\d+)/g)].map((m) => [m[1], Number(m[2])]),
    );
    expect(sqlRules).toEqual({
      inactive_days: CRM_RULES.inactiveDays,
      due_soon_days: CRM_RULES.dueSoonDays,
      recurrent_return_days: CRM_RULES.recurrentReturnDays,
      task_lead_days: CRM_RULES.taskLeadDays,
    });
    expect(
      listIn(/channel text not null check \(channel in \(('llamada', 'whatsapp', 'sms'[^)]*)\)\)/),
    ).toEqual([...CONTACT_CHANNELS]);
    expect(
      listIn(/channel text not null check \(channel in \(('llamada', 'whatsapp', 'email', 'presencial')\)\)/),
    ).toEqual([...TASK_CHANNELS]);
    expect(listIn(/kind text not null check \(kind in \(('llamar'[^)]*)\)\)/)).toEqual([...TASK_KINDS]);
    expect(listIn(/status text not null default 'pendiente' check \(status in \(([^)]+)\)\)/)).toEqual([
      ...TASK_STATUSES,
    ]);
    expect(
      listIn(/source text not null default 'manual' check \(source in \(('manual', 'os_terminada'[^)]*)\)\)/),
    ).toEqual([...TASK_SOURCES]);
    expect(listIn(/outcome text check \(outcome in \(([^)]+)\)\)/)).toEqual([...TASK_OUTCOMES]);
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
