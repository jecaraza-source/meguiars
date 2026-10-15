import {
  EVIDENCE_BUCKET,
  evidencePath,
  fail,
  type AppRole,
  type EvidenceKind,
  type ItemWorkStatus,
  type MyWorkActionResult,
  type MyWorkAppointment,
  type MyWorkDay,
  type MyWorkOrder,
  type MyWorkRepository,
  type MyWorkVehicle,
  type Result,
  type ServiceOrderStatus,
} from "@meguiars/domain";
import {
  evidenceMetaSchema,
  linkTechnicianSchema,
  myWorkCommentSchema,
  myWorkDaySchema,
  myWorkDoneSchema,
  myWorkProblemSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Json } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

/** Duración de las URL firmadas de las fotos de «Mi día» (segundos). */
export const MY_WORK_PHOTO_URL_TTL = 600;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

const toVehicle = (v: unknown): MyWorkVehicle => {
  const o = obj(v);
  return { make: str(o.make), model: str(o.model), year: Number(o.year) || 0, plate: str(o.plate) };
};

/** Convierte la respuesta de public.my_work (jsonb) al modelo del dominio. */
export function parseMyWork(json: Json): MyWorkDay {
  const root = obj(json);
  const orders: MyWorkOrder[] = arr(root.orders).map((raw) => {
    const o = obj(raw);
    return {
      id: str(o.id),
      organizationId: str(o.organization_id),
      detailCenterId: str(o.detail_center_id),
      folio: str(o.folio),
      status: str(o.status) as ServiceOrderStatus,
      scheduledAt: str(o.scheduled_at),
      promisedAt: strOrNull(o.promised_at),
      bay: strOrNull(o.bay),
      vehicle: toVehicle(o.vehicle),
      observations: strOrNull(o.observations),
      items: arr(o.items).map((r) => {
        const i = obj(r);
        return {
          id: str(i.id),
          name: str(i.name),
          quantity: Number(i.quantity) || 1,
          status: str(i.status) as ItemWorkStatus,
          mine: i.mine === true,
          startedAt: strOrNull(i.started_at),
          finishedAt: strOrNull(i.finished_at),
        };
      }),
      photos: arr(o.evidence).map((r) => {
        const e = obj(r);
        return {
          id: str(e.id),
          kind: str(e.kind) as EvidenceKind,
          path: str(e.path),
          itemId: strOrNull(e.item_id),
          at: str(e.at),
          url: null,
        };
      }),
      comments: arr(o.comments).map((r) => {
        const c = obj(r);
        return { note: str(c.note), itemId: strOrNull(c.item_id), at: str(c.at), by: strOrNull(c.by) };
      }),
      openProblems: Number(o.open_problems) || 0,
    };
  });
  const appointments: MyWorkAppointment[] = arr(root.appointments).map((raw) => {
    const a = obj(raw);
    return {
      id: str(a.id),
      startsAt: str(a.starts_at),
      endsAt: str(a.ends_at),
      bay: strOrNull(a.bay),
      vehicle: toVehicle(a.vehicle),
      services: arr(a.services).map(str),
      notes: strOrNull(a.notes),
    };
  });
  return {
    day: str(root.day),
    today: str(root.today),
    technicianId: str(root.technician_id),
    orders,
    appointments,
  };
}

const toAction = (json: Json): MyWorkActionResult => {
  const o = obj(json);
  return {
    itemStatus: str(o.item_status) as ItemWorkStatus,
    orderStatus: str(o.order_status) as ServiceOrderStatus,
    orderFinished: o.order_finished === true,
  };
};

async function runVoid(call: () => PromiseLike<{ error: unknown }>): Promise<Result<void>> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

/**
 * Adaptador Supabase de «Mi día». Todo va por RPC security definer que
 * verifican que la OS esté asignada al técnico de la sesión; las fotos se
 * suben al bucket privado de evidencias (la política de Storage también lo
 * verifica) y se leen con URL firmadas.
 */
export function createMyWorkRepository(client: MeguiarsSupabaseClient): MyWorkRepository {
  return {
    async get(detailCenterId, day) {
      const parsed = myWorkDaySchema.safeParse({ detailCenterId, day });
      if (!parsed.success) return invalid(parsed.error);
      const result = await run(
        () =>
          client.rpc("my_work", {
            p_detail_center_id: parsed.data.detailCenterId,
            ...(parsed.data.day ? { p_day: parsed.data.day } : {}),
          }),
        parseMyWork,
      );
      if (!result.ok) return result;
      const paths = result.data.orders.flatMap((o) => o.photos.map((p) => p.path));
      if (paths.length === 0) return result;
      try {
        const signed = await client.storage
          .from(EVIDENCE_BUCKET)
          .createSignedUrls(paths, MY_WORK_PHOTO_URL_TTL);
        const urls = new Map(
          ((signed.data ?? []) as { path: string | null; signedUrl: string | null }[]).map((s) => [
            s.path,
            s.signedUrl,
          ]),
        );
        for (const order of result.data.orders) {
          for (const photo of order.photos) photo.url = urls.get(photo.path) ?? null;
        }
      } catch {
        // Sin URL firmada la tarjeta muestra sólo el conteo de fotos.
      }
      return result;
    },

    start(itemId) {
      const parsed = myWorkDoneSchema.safeParse({ itemId });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(() => client.rpc("my_work_start", { p_item_id: parsed.data.itemId }), toAction);
    },

    done(itemId, note) {
      const parsed = myWorkDoneSchema.safeParse({ itemId, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("my_work_done", {
            p_item_id: parsed.data.itemId,
            ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
          }),
        toAction,
      );
    },

    comment(orderId, note, itemId) {
      const parsed = myWorkCommentSchema.safeParse({ orderId, note, itemId });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return runVoid(() =>
        client.rpc("my_work_note", {
          p_order_id: parsed.data.orderId,
          p_note: parsed.data.note,
          ...(parsed.data.itemId ? { p_item_id: parsed.data.itemId } : {}),
        }),
      );
    },

    async uploadPhoto(command) {
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
            return fail("permission_denied", "Esta orden no está asignada a ti");
          return fail("unavailable", upload.error.message);
        }
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
      return run(
        () =>
          client.rpc("my_work_register_evidence", {
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

    reportProblem(orderId, description, itemId) {
      const parsed = myWorkProblemSchema.safeParse({ orderId, description, itemId });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("my_work_report_problem", {
            p_order_id: parsed.data.orderId,
            p_description: parsed.data.description,
            ...(parsed.data.itemId ? { p_item_id: parsed.data.itemId } : {}),
          }),
        (row) => ({ id: row.id }),
      );
    },

    listTechnicianUsers(detailCenterId) {
      return run(
        () => client.rpc("center_technician_users", { p_detail_center_id: detailCenterId }),
        (rows) =>
          rows.map((r) => ({
            userId: r.user_id,
            fullName: r.full_name,
            role: r.role as AppRole,
            technicianId: r.technician_id,
          })),
      );
    },

    linkTechnicianUser(technicianId, userId, reason) {
      const parsed = linkTechnicianSchema.safeParse({ technicianId, userId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("link_technician_user", {
            p_technician_id: parsed.data.technicianId,
            p_reason: parsed.data.reason,
            ...(parsed.data.userId ? { p_user_id: parsed.data.userId } : {}),
          }),
        () => undefined,
      );
    },
  };
}
