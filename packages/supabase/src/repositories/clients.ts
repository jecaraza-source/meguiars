import {
  type Client,
  type ClientDetail,
  type ClientHistoryEntry,
  type ClientKind,
  type ClientMatch,
  type ClientRepository,
  type ClientSearchResult,
  type ChangeSource,
  type ClientHistoryKind,
  type DuplicateField,
  type MarketingChannel,
  type SearchMatch,
  type Vehicle,
} from "@meguiars/domain";
import {
  addVehicleSchema,
  clientSearchSchema,
  createClientSchema,
  linkClientSchema,
  updateClientSchema,
  updateVehicleSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Tables } from "../database.types";
import { invalid, run } from "./shared";

type Fn = Database["public"]["Functions"];

export const toClient = (row: Tables<"clients">): Client => ({
  id: row.id,
  organizationId: row.organization_id,
  homeDetailCenterId: row.home_detail_center_id,
  kind: row.kind as ClientKind,
  fullName: row.full_name,
  phone: row.phone,
  email: row.email,
  notes: row.notes,
  marketing: {
    optIn: row.marketing_opt_in,
    channels: row.marketing_channels as MarketingChannel[],
    updatedAt: row.marketing_opt_in_at,
    source: row.marketing_opt_in_source as ChangeSource | null,
  },
  lastVisitAt: row.last_visit_at,
  lastVisitDetailCenterId: row.last_visit_detail_center_id,
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const toVehicle = (row: Tables<"vehicles">): Vehicle => ({
  id: row.id,
  clientId: row.client_id,
  make: row.make,
  model: row.model,
  year: row.year,
  plate: row.plate,
  identifier: row.identifier,
  notes: row.notes,
  active: row.active,
  createdAt: row.created_at,
});

const toSearchResult = (row: Fn["search_clients"]["Returns"][number]): ClientSearchResult => ({
  id: row.id,
  fullName: row.full_name,
  phone: row.phone,
  email: row.email,
  kind: row.kind as ClientKind,
  homeDetailCenterId: row.home_detail_center_id,
  homeCenterName: row.home_center_name,
  lastVisitAt: row.last_visit_at,
  inActiveCenter: row.in_active_center,
  plates: row.plates,
  matchedOn: row.matched_on as SearchMatch,
});

const toMatch = (row: Fn["find_client_matches"]["Returns"][number]): ClientMatch => ({
  clientId: row.client_id,
  displayName: row.display_name,
  phoneHint: row.phone_hint,
  homeCenterName: row.home_center_name,
  matchedOn: row.matched_on as DuplicateField[],
  visible: row.visible,
});

const toHistory = (row: Fn["client_history"]["Returns"][number]): ClientHistoryEntry => ({
  occurredAt: row.occurred_at,
  kind: row.kind as ClientHistoryKind,
  detailCenterId: row.detail_center_id,
  detailCenterName: row.detail_center_name,
  title: row.title,
  vehicleId: row.vehicle_id,
});

type DetailRow = Tables<"clients"> & {
  vehicles: Tables<"vehicles">[];
  client_centers: Pick<Tables<"client_centers">, "detail_center_id">[];
};

/**
 * Adaptador Supabase del puerto `ClientRepository`. Toda escritura va por RPC
 * (validación, duplicados, idempotencia y auditoría en la base); las lecturas
 * pasan por RLS, así que sólo devuelven lo visible desde los centros del usuario.
 */
export function createClientRepository(client: MeguiarsSupabaseClient): ClientRepository {
  return {
    search(detailCenterId, query) {
      const parsed = clientSearchSchema.safeParse({ detailCenterId, query });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("search_clients", { p_detail_center_id: detailCenterId, p_query: parsed.data.query }),
        (rows) => rows.map(toSearchResult),
      );
    },

    get(id) {
      return run(
        () =>
          client
            .from("clients")
            .select("*, vehicles(*), client_centers(detail_center_id)")
            .eq("id", id)
            .maybeSingle(),
        (row): ClientDetail => {
          const detail = row as unknown as DetailRow;
          return {
            ...toClient(detail),
            vehicles: [...detail.vehicles]
              .sort((a, b) => Number(b.active) - Number(a.active) || a.created_at.localeCompare(b.created_at))
              .map(toVehicle),
            centerIds: detail.client_centers.map((c) => c.detail_center_id),
          };
        },
      );
    },

    history(id) {
      return run(
        () => client.rpc("client_history", { p_client_id: id }),
        (rows) => rows.map(toHistory),
      );
    },

    findMatches(query) {
      return run(
        () =>
          client.rpc("find_client_matches", {
            p_detail_center_id: query.detailCenterId,
            p_phone: query.phone,
            ...(query.email ? { p_email: query.email } : {}),
            p_plates: query.plates ?? [],
            p_identifiers: query.identifiers ?? [],
            ...(query.excludeClientId ? { p_exclude_client_id: query.excludeClientId } : {}),
          }),
        (rows) => rows.map(toMatch),
      );
    },

    create(command) {
      const parsed = createClientSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client
            .rpc("create_client", {
              p_detail_center_id: c.detailCenterId,
              p_request_id: c.requestId,
              p_full_name: c.fullName,
              p_phone: c.phone,
              ...(c.email ? { p_email: c.email } : {}),
              p_kind: c.kind,
              ...(c.notes ? { p_notes: c.notes } : {}),
              p_marketing_channels: c.marketingChannels,
              p_source: c.source,
              p_vehicles: c.vehicles.map((v) => ({
                make: v.make,
                model: v.model,
                year: v.year,
                plate: v.plate,
                identifier: v.identifier ?? null,
                notes: v.notes ?? null,
              })),
              ...(c.duplicateReason ? { p_duplicate_reason: c.duplicateReason } : {}),
            })
            .single(),
        toClient,
      );
    },

    update(command) {
      const parsed = updateClientSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client
            .rpc("update_client", {
              p_id: c.id,
              p_full_name: c.fullName,
              p_phone: c.phone,
              p_email: c.email ?? "",
              p_kind: c.kind,
              p_notes: c.notes ?? "",
              p_home_detail_center_id: c.homeDetailCenterId,
              p_marketing_channels: c.marketingChannels,
              p_source: c.source,
              p_reason: c.reason,
              p_confirm_duplicate: c.confirmDuplicate ?? false,
            })
            .single(),
        toClient,
      );
    },

    addVehicle(command) {
      const parsed = addVehicleSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const v = parsed.data;
      return run(
        () =>
          client
            .rpc("add_vehicle", {
              p_client_id: v.clientId,
              p_detail_center_id: v.detailCenterId,
              p_request_id: v.requestId,
              p_make: v.make,
              p_model: v.model,
              p_year: v.year,
              p_plate: v.plate,
              ...(v.identifier ? { p_identifier: v.identifier } : {}),
              ...(v.notes ? { p_notes: v.notes } : {}),
            })
            .single(),
        toVehicle,
      );
    },

    updateVehicle(command) {
      const parsed = updateVehicleSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const v = parsed.data;
      return run(
        () =>
          client
            .rpc("update_vehicle", {
              p_id: v.id,
              p_make: v.make,
              p_model: v.model,
              p_year: v.year,
              p_plate: v.plate,
              p_identifier: v.identifier ?? "",
              p_notes: v.notes ?? "",
              p_active: v.active,
              p_reason: v.reason,
            })
            .single(),
        toVehicle,
      );
    },

    linkToCenter(clientId, detailCenterId, reason) {
      const parsed = linkClientSchema.safeParse({ clientId, detailCenterId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("link_client_to_center", {
            p_client_id: clientId,
            p_detail_center_id: detailCenterId,
            p_reason: parsed.data.reason,
          }),
        (id) => id,
      );
    },
  };
}
