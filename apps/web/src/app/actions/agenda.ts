"use server";

import { activeCenterAccess, agendaCopy, guardScreen, type RepoError, type Screen } from "@meguiars/domain";
import { createAgendaRepository } from "@meguiars/supabase";
import {
  appointmentFormSchema,
  fieldErrors,
  rescheduleFormSchema,
  setStatusSchema,
  toCreateAppointmentCommand,
  toUpdateAppointmentCommand,
  upsertResourceSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AgendaFormState extends ActionFormState {
  /** La bahía o el técnico están ocupados: se ofrece el override (sólo encargado/admin). */
  conflict?: boolean;
}

const multi = ["serviceIds"];

function agendaError(error: RepoError): string {
  if (error.code === "23P01") return agendaCopy.conflict;
  if (error.kind === "permission_denied") return error.message;
  return error.message;
}

/** Centro activo del servidor (zona horaria incluida) y repositorio. */
async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createAgendaRepository(supabase) };
}

export async function createAppointmentAction(
  _prev: AgendaFormState,
  form: FormData,
): Promise<AgendaFormState> {
  const ctx = await context("appointmentNew");
  if (!ctx) return stamp({ error: agendaCopy.notFound });
  const parsed = appointmentFormSchema.safeParse({
    vehicleId: text(form, "vehicleId"),
    serviceIds: form.getAll("serviceIds"),
    walkIn: text(form, "walkIn") === "1",
    date: text(form, "date"),
    time: text(form, "time"),
    durationMinutes: text(form, "durationMinutes"),
    bayId: text(form, "bayId"),
    technicianId: text(form, "technicianId"),
    notes: text(form, "notes"),
    overrideReason: text(form, "overrideReason"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form, multi) });
  const result = await ctx.repo.create(
    toCreateAppointmentCommand(parsed.data, {
      detailCenterId: ctx.center.id,
      requestId: text(form, "requestId"),
      clientId: text(form, "clientId"),
      timeZone: ctx.center.timezone,
    }),
  );
  if (!result.ok) {
    return stamp({
      error: agendaError(result.error),
      conflict: result.error.code === "23P01",
      values: values(form, multi),
    });
  }
  revalidatePath("/agenda");
  redirect(`/agenda/${result.data.id}?nueva=1`);
}

export async function rescheduleAction(_prev: AgendaFormState, form: FormData): Promise<AgendaFormState> {
  const ctx = await context("appointmentNew");
  if (!ctx) return stamp({ error: agendaCopy.notFound });
  const id = text(form, "id");
  const parsed = rescheduleFormSchema.safeParse({
    serviceIds: form.getAll("serviceIds"),
    date: text(form, "date"),
    time: text(form, "time"),
    durationMinutes: text(form, "durationMinutes"),
    bayId: text(form, "bayId"),
    technicianId: text(form, "technicianId"),
    notes: text(form, "notes"),
    reason: text(form, "reason"),
    overrideReason: text(form, "overrideReason"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form, multi) });
  const result = await ctx.repo.update(
    toUpdateAppointmentCommand(parsed.data, { id, timeZone: ctx.center.timezone }),
  );
  if (!result.ok) {
    return stamp({
      error: agendaError(result.error),
      conflict: result.error.code === "23P01",
      values: values(form, multi),
    });
  }
  revalidatePath(`/agenda/${id}`);
  return stamp({ message: agendaCopy.saved });
}

export async function setStatusAction(_prev: AgendaFormState, form: FormData): Promise<AgendaFormState> {
  const ctx = await context("appointmentNew");
  if (!ctx) return stamp({ error: agendaCopy.notFound });
  const parsed = setStatusSchema.safeParse({
    id: text(form, "id"),
    status: text(form, "status"),
    reason: text(form, "statusReason"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return stamp({
      fields: { statusReason: errors.reason ?? Object.values(errors)[0] ?? "" },
      values: values(form),
    });
  }
  const result = await ctx.repo.setStatus(parsed.data);
  if (!result.ok) return stamp({ error: agendaError(result.error) });
  revalidatePath(`/agenda/${parsed.data.id}`);
  revalidatePath("/agenda");
  return stamp({ message: agendaCopy.saved });
}

async function upsertResource(kind: "bay" | "technician", form: FormData): Promise<AgendaFormState> {
  const ctx = await context("agenda");
  if (!ctx) return stamp({ error: agendaCopy.notFound });
  const parsed = upsertResourceSchema.safeParse({
    detailCenterId: ctx.center.id,
    id: text(form, "id"),
    name: text(form, "name"),
    active: text(form, "active") !== "0",
    reason: text(form, "reason") || (text(form, "id") ? "Cambio de recurso" : "Alta de recurso"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["id", "detailCenterId"], form));
  const repo = ctx.repo;
  const result =
    kind === "bay" ? await repo.upsertBay(parsed.data) : await repo.upsertTechnician(parsed.data);
  if (!result.ok) {
    return stamp({
      error: result.error.code === "23505" ? "Ya existe con ese nombre." : result.error.message,
    });
  }
  revalidatePath("/agenda");
  return stamp({ message: agendaCopy.saved });
}

export async function upsertBayAction(_prev: AgendaFormState, form: FormData): Promise<AgendaFormState> {
  return upsertResource("bay", form);
}

export async function upsertTechnicianAction(
  _prev: AgendaFormState,
  form: FormData,
): Promise<AgendaFormState> {
  return upsertResource("technician", form);
}
