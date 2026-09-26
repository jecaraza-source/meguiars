import {
  EVIDENCE_BUCKET,
  evidencePath,
  fail,
  type ExecutionRepository,
  type InventoryItem,
  type InventoryUnit,
  type OrderExecution,
  type SupplyStandard,
} from "@meguiars/domain";
import {
  consumptionFormSchema,
  evidenceMetaSchema,
  incidentFormSchema,
  inventoryItemSchema,
  itemWorkSchema,
  removeEvidenceSchema,
  resolveIncidentSchema,
  staffSchema,
  supplyStandardSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Tables } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

/** Duración de las URL firmadas de las fotos (segundos). */
export const EVIDENCE_URL_TTL = 600;

const toInventory = (row: Tables<"inventory_items">): InventoryItem => ({
  id: row.id,
  organizationId: row.organization_id,
  code: row.code,
  name: row.name,
  unit: row.unit as InventoryUnit,
  unitCost: Number(row.unit_cost),
  active: row.active,
});

type StandardRow = Tables<"service_supply_standards"> & { inventory_items: Tables<"inventory_items"> | null };

const toStandard = (row: StandardRow): SupplyStandard => ({
  inventoryItemId: row.inventory_item_id,
  code: row.inventory_items?.code ?? "",
  name: row.inventory_items?.name ?? "",
  unit: (row.inventory_items?.unit ?? "pza") as InventoryUnit,
  quantity: Number(row.quantity),
});

/**
 * Adaptador Supabase del puerto `ExecutionRepository`. Las fotos se suben a un
 * bucket privado (las políticas de Storage validan centro y OS en la ruta) y se
 * leen con URL firmadas; todo lo demás va por RPC con motivo y auditoría.
 */
export function createExecutionRepository(client: MeguiarsSupabaseClient): ExecutionRepository {
  return {
    async get(orderId) {
      try {
        const [items, staff, events, evidence, consumptions, incidents] = await Promise.all([
          client.from("service_order_items").select("*").eq("service_order_id", orderId).order("position"),
          client.from("service_order_staff").select("technician_id").eq("service_order_id", orderId),
          client
            .from("service_order_events")
            .select("*")
            .eq("service_order_id", orderId)
            .order("occurred_at")
            .order("id"),
          client
            .from("service_order_evidence")
            .select("*")
            .eq("service_order_id", orderId)
            .is("deleted_at", null)
            .order("created_at"),
          client
            .from("service_order_consumptions")
            .select("*, inventory_items(name)")
            .eq("service_order_id", orderId),
          client
            .from("service_order_incidents")
            .select("*")
            .eq("service_order_id", orderId)
            .order("created_at"),
        ]);
        const failed = [items, staff, events, evidence, consumptions, incidents].find((r) => r.error);
        if (failed?.error) return { ok: false, error: toRepoError(failed.error) };
        const itemRows = items.data ?? [];
        const serviceIds = [...new Set(itemRows.map((i) => i.service_id))];
        const standards = serviceIds.length
          ? await client
              .from("service_supply_standards")
              .select("*, inventory_items(*)")
              .in("service_id", serviceIds)
          : { data: [] as StandardRow[], error: null };
        if (standards.error) return { ok: false, error: toRepoError(standards.error) };
        const evidenceRows = evidence.data ?? [];
        const signed = evidenceRows.length
          ? await client.storage.from(EVIDENCE_BUCKET).createSignedUrls(
              evidenceRows.map((e) => e.storage_path),
              EVIDENCE_URL_TTL,
            )
          : { data: [], error: null };
        const urlOf = (path: string) =>
          (signed.data as { path: string | null; signedUrl: string | null }[] | null)?.find(
            (s) => s.path === path,
          )?.signedUrl ?? null;
        const data: OrderExecution = {
          orderId,
          lines: itemRows.map((i) => ({
            id: i.id,
            serviceId: i.service_id,
            serviceCode: i.service_code,
            serviceName: i.service_name,
            quantity: i.quantity,
            workStatus: i.work_status,
            startedAt: i.started_at,
            finishedAt: i.finished_at,
            workStartedAt: i.work_started_at,
            workedMinutes: i.worked_minutes,
            technicianId: i.technician_id,
            standards: ((standards.data ?? []) as StandardRow[])
              .filter((s) => s.service_id === i.service_id && s.inventory_items?.active !== false)
              .map(toStandard),
          })),
          staffIds: (staff.data ?? []).map((s) => s.technician_id),
          events: (events.data ?? []).map((e) => ({
            id: e.id,
            kind: e.kind as OrderExecution["events"][number]["kind"],
            itemId: e.item_id,
            technicianId: e.technician_id,
            note: e.note,
            actorId: e.actor_id,
            occurredAt: e.occurred_at,
          })),
          evidence: evidenceRows.map((e) => ({
            id: e.id,
            kind: e.kind as OrderExecution["evidence"][number]["kind"],
            itemId: e.item_id,
            incidentId: e.incident_id,
            storagePath: e.storage_path,
            contentType: e.content_type as OrderExecution["evidence"][number]["contentType"],
            sizeBytes: e.size_bytes,
            width: e.width,
            height: e.height,
            note: e.note,
            createdAt: e.created_at,
            signedUrl: urlOf(e.storage_path),
          })),
          consumptions: (
            (consumptions.data ?? []) as (Tables<"service_order_consumptions"> & {
              inventory_items: { name: string } | null;
            })[]
          ).map((c) => ({
            id: c.id,
            itemId: c.item_id,
            inventoryItemId: c.inventory_item_id,
            inventoryName: c.inventory_items?.name ?? "",
            unit: c.unit as InventoryUnit,
            standardQuantity: Number(c.standard_quantity),
            actualQuantity: Number(c.actual_quantity),
            unitCost: Number(c.unit_cost),
            note: c.note,
          })),
          incidents: (incidents.data ?? []).map((i) => ({
            id: i.id,
            kind: i.kind as "incidencia" | "retrabajo",
            itemId: i.item_id,
            description: i.description,
            status: i.status as "abierta" | "resuelta",
            resolution: i.resolution,
            createdAt: i.created_at,
            resolvedAt: i.resolved_at,
          })),
        };
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    setItemWork(command) {
      const parsed = itemWorkSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("set_service_order_item_work", {
            p_item_id: c.itemId,
            p_status: c.status,
            ...(c.technicianId ? { p_technician_id: c.technicianId } : {}),
            ...(c.note ? { p_note: c.note } : {}),
          }),
        (row) => ({ id: row.id, workStatus: row.work_status }),
      );
    },

    setStaff(orderId, technicianIds) {
      const parsed = staffSchema.safeParse({ orderId, technicianIds });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("set_service_order_staff", {
            p_order_id: parsed.data.orderId,
            p_technician_ids: parsed.data.technicianIds,
          }),
        (rows) => rows.map((r) => r.technician_id),
      );
    },

    async uploadEvidence(command) {
      const parsed = evidenceMetaSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const m = parsed.data;
      const path = evidencePath(command.order, command.fileId, m.contentType);
      try {
        const upload = await client.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, command.file, { contentType: m.contentType, upsert: false });
        // Reintento del mismo archivo: ya existe; se registra igual (idempotente por ruta).
        if (upload.error && !/exists|duplicate/i.test(upload.error.message)) {
          const status = (upload.error as { statusCode?: string }).statusCode;
          if (status === "403" || /row-level security|unauthorized/i.test(upload.error.message))
            return fail("permission_denied", "Sin permiso para subir evidencias a esta OS");
          return fail("unavailable", upload.error.message);
        }
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
      return run(
        () =>
          client.rpc("register_service_order_evidence", {
            p_order_id: command.order.id,
            p_storage_path: path,
            p_kind: m.kind,
            p_content_type: m.contentType,
            p_size_bytes: m.sizeBytes,
            ...(m.width ? { p_width: m.width } : {}),
            ...(m.height ? { p_height: m.height } : {}),
            ...(m.itemId ? { p_item_id: m.itemId } : {}),
            ...(m.incidentId ? { p_incident_id: m.incidentId } : {}),
            ...(m.note ? { p_note: m.note } : {}),
          }),
        (row) => ({ id: row.id }),
      );
    },

    removeEvidence(evidenceId, reason) {
      const parsed = removeEvidenceSchema.safeParse({ evidenceId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("remove_service_order_evidence", {
            p_evidence_id: parsed.data.evidenceId,
            p_reason: parsed.data.reason,
          }),
        () => undefined,
      );
    },

    recordConsumption(command) {
      const parsed = consumptionFormSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("record_service_order_consumption", {
            p_item_id: c.itemId,
            p_inventory_item_id: c.inventoryItemId,
            p_actual_quantity: c.actualQuantity,
            ...(c.note ? { p_note: c.note } : {}),
          }),
        (row) => ({ id: row.id }),
      );
    },

    reportIncident(command) {
      const parsed = incidentFormSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("report_service_order_incident", {
            p_order_id: c.orderId,
            p_kind: c.kind,
            p_description: c.description,
            ...(c.itemId ? { p_item_id: c.itemId } : {}),
          }),
        (row) => ({ id: row.id }),
      );
    },

    resolveIncident(incidentId, resolution) {
      const parsed = resolveIncidentSchema.safeParse({ incidentId, resolution });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("resolve_service_order_incident", {
            p_incident_id: parsed.data.incidentId,
            p_resolution: parsed.data.resolution,
          }),
        () => undefined,
      );
    },

    listInventory(organizationId) {
      return run(
        () => client.from("inventory_items").select("*").eq("organization_id", organizationId).order("name"),
        (rows) => rows.map(toInventory),
      );
    },

    upsertInventoryItem(command) {
      const parsed = inventoryItemSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_inventory_item", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_code: c.code,
            p_name: c.name,
            p_unit: c.unit,
            p_unit_cost: c.unitCost,
            p_active: c.active,
            p_reason: c.reason,
          }),
        toInventory,
      );
    },

    listStandards(serviceId) {
      return run(
        () =>
          client.from("service_supply_standards").select("*, inventory_items(*)").eq("service_id", serviceId),
        (rows) => (rows as unknown as StandardRow[]).map(toStandard),
      );
    },

    async setSupplyStandard(command) {
      const parsed = supplyStandardSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      try {
        const { error } = await client.rpc("set_service_supply_standard", {
          p_service_id: c.serviceId,
          p_inventory_item_id: c.inventoryItemId,
          p_quantity: c.quantity ?? null,
          p_reason: c.reason,
        });
        return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },
  };
}
