import type { CatalogItem, CatalogRepository, PriceHistoryEntry, Service } from "@meguiars/domain";
import {
  catalogFilterSchema,
  centerConfigSchema,
  createServiceSchema,
  updateServiceSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Tables } from "../database.types";
import { invalid, run } from "./shared";

// numeric llega de PostgREST como número (o texto en algunos clientes): se normaliza.
const num = (v: number | string) => Number(v);
const numOrNull = (v: number | string | null) => (v === null ? null : Number(v));

export const toService = (row: Tables<"services">): Service => ({
  id: row.id,
  organizationId: row.organization_id,
  code: row.code,
  name: row.name,
  description: row.description,
  revenueEngine: row.revenue_engine,
  standardDurationMinutes: row.standard_duration_minutes,
  basePrice: num(row.base_price),
  standardDirectCost: num(row.standard_direct_cost),
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toCatalogItem = (
  row: Database["public"]["Functions"]["center_catalog"]["Returns"][number],
): CatalogItem => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  revenueEngine: row.revenue_engine,
  standardDurationMinutes: row.standard_duration_minutes,
  basePrice: num(row.base_price),
  standardDirectCost: num(row.standard_direct_cost),
  price: num(row.price),
  directCost: num(row.direct_cost),
  priceSource: row.price_source === "center" ? "center" : "base",
  available: row.available,
  active: row.active,
});

const toHistory = (row: Tables<"service_price_history">): PriceHistoryEntry => ({
  id: row.id,
  detailCenterId: row.detail_center_id,
  price: numOrNull(row.price),
  directCost: numOrNull(row.direct_cost),
  validFrom: row.valid_from,
  reason: row.reason,
});

/**
 * Adaptador Supabase del puerto `CatalogRepository`. Las escrituras van por
 * RPC (motivo, auditoría e historial de precios en la base); RLS limita la
 * lectura a la organización y a los centros del usuario.
 */
export function createCatalogRepository(client: MeguiarsSupabaseClient): CatalogRepository {
  return {
    listForCenter(detailCenterId, filter = {}) {
      const parsed = catalogFilterSchema.safeParse(filter);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("center_catalog", {
            p_detail_center_id: detailCenterId,
            ...(parsed.data.revenueEngine ? { p_revenue_engine: parsed.data.revenueEngine } : {}),
            p_include_inactive: parsed.data.includeInactive ?? false,
          }),
        (rows) => rows.map(toCatalogItem),
      );
    },

    get(serviceId) {
      return run(() => client.from("services").select("*").eq("id", serviceId).maybeSingle(), toService);
    },

    priceHistory(serviceId) {
      return run(
        () =>
          client
            .from("service_price_history")
            .select("*")
            .eq("service_id", serviceId)
            .order("valid_from", { ascending: false })
            .order("id", { ascending: false }),
        (rows) => rows.map(toHistory),
      );
    },

    create(command) {
      const parsed = createServiceSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_service", {
            p_organization_id: c.organizationId,
            p_code: c.code,
            p_name: c.name,
            p_description: c.description ?? "",
            p_revenue_engine: c.revenueEngine,
            p_standard_duration_minutes: c.standardDurationMinutes,
            p_base_price: c.basePrice,
            p_standard_direct_cost: c.standardDirectCost,
          }),
        toService,
      );
    },

    update(command) {
      const parsed = updateServiceSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("update_service", {
            p_id: c.id,
            p_name: c.name,
            p_description: c.description ?? "",
            p_revenue_engine: c.revenueEngine,
            p_standard_duration_minutes: c.standardDurationMinutes,
            p_base_price: c.basePrice,
            p_standard_direct_cost: c.standardDirectCost,
            p_active: c.active,
            p_reason: c.reason,
          }),
        toService,
      );
    },

    async configureCenter(command) {
      const parsed = centerConfigSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      const result = await run(
        () =>
          client.rpc("set_service_center_config", {
            p_detail_center_id: c.detailCenterId,
            p_service_id: c.serviceId,
            p_available: c.available,
            p_price_override: c.priceOverride ?? null,
            p_direct_cost_override: c.directCostOverride ?? null,
            p_reason: c.reason,
          }),
        () => undefined,
      );
      return result;
    },
  };
}
