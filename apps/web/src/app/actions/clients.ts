"use server";

import {
  authCopy,
  clientErrorMessage,
  clientsCopy,
  guardScreen,
  isPossibleDuplicate,
  type ClientMatch,
  type Screen,
} from "@meguiars/domain";
import { createClientRepository } from "@meguiars/supabase";
import {
  addVehicleSchema,
  fieldErrors,
  newClientFormSchema,
  toCreateClientCommand,
  updateClientSchema,
  updateVehicleSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values as formValues, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ClientFormState extends ActionFormState {
  /** Posibles duplicados encontrados al registrar. */
  matches?: ClientMatch[];
  /** Edición: el teléfono/email pertenece a otro cliente; se pide confirmar. */
  needsConfirm?: boolean;
}

const values = (form: FormData) => formValues(form, ["marketingChannels"]);

/** Centro activo del servidor (nunca uno enviado por el cliente) y repositorio. */
async function context(screen: Screen) {
  const state = await getAuthState();
  const guard = guardScreen(state, screen);
  if (!guard.allow || state.status !== "signed_in" || !state.activeCenterId) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return { centerId: state.activeCenterId, repo: createClientRepository(supabase) };
}

export async function createClientAction(prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  return stamp(await createClientActionImpl(prev, form));
}

async function createClientActionImpl(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  const ctx = await context("clientNew");
  if (!ctx) return { error: authCopy.forbidden };
  const submitted = values(form);
  const parsed = newClientFormSchema.safeParse({
    fullName: text(form, "fullName"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    kind: text(form, "kind") || "person",
    notes: text(form, "notes"),
    marketingChannels: form.getAll("marketingChannels"),
    make: text(form, "make"),
    model: text(form, "model"),
    year: text(form, "year"),
    plate: text(form, "plate"),
    identifier: text(form, "identifier"),
    vehicleNotes: text(form, "vehicleNotes"),
    duplicateReason: text(form, "duplicateReason"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: submitted };
  const command = toCreateClientCommand(parsed.data, {
    detailCenterId: ctx.centerId,
    requestId: text(form, "requestId"),
    source: "web",
  });

  // Aviso previo de duplicados (la base lo vuelve a verificar al registrar).
  if (!command.duplicateReason) {
    const matches = await ctx.repo.findMatches({
      detailCenterId: ctx.centerId,
      phone: command.phone,
      email: command.email,
      plates: command.vehicles.map((v) => v.plate),
      identifiers: command.vehicles.flatMap((v) => (v.identifier ? [v.identifier] : [])),
    });
    if (!matches.ok) return { error: clientErrorMessage(matches.error), values: submitted };
    if (matches.data.length > 0) return { matches: matches.data, values: submitted };
  }

  const result = await ctx.repo.create(command);
  if (!result.ok) {
    if (isPossibleDuplicate(result.error)) {
      const matches = await ctx.repo.findMatches({ detailCenterId: ctx.centerId, phone: command.phone });
      return { matches: matches.ok ? matches.data : [], values: submitted };
    }
    return { error: clientErrorMessage(result.error), values: submitted };
  }
  revalidatePath("/clientes");
  redirect(`/clientes/${result.data.id}?nuevo=1`);
}

/** "Usar este cliente" cuando existe en otro centro: lo vincula al centro activo. */
export async function linkClientAction(form: FormData): Promise<void> {
  const ctx = await context("clientNew");
  if (!ctx) redirect("/sin-permiso");
  const clientId = text(form, "clientId");
  const result = await ctx.repo.linkToCenter(clientId, ctx.centerId, clientsCopy.linkReasonDefault);
  if (!result.ok) redirect(`/clientes?error=${encodeURIComponent(clientErrorMessage(result.error))}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${clientId}`);
}

export async function updateClientAction(prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  return stamp(await updateClientActionImpl(prev, form));
}

async function updateClientActionImpl(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  const ctx = await context("clientNew");
  if (!ctx) return { error: authCopy.forbidden };
  const submitted = values(form);
  const parsed = updateClientSchema.safeParse({
    id: text(form, "id"),
    fullName: text(form, "fullName"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    kind: text(form, "kind"),
    notes: text(form, "notes"),
    homeDetailCenterId: text(form, "homeDetailCenterId"),
    marketingChannels: form.getAll("marketingChannels"),
    source: "web",
    reason: text(form, "reason"),
    confirmDuplicate: text(form, "confirmDuplicate") === "1",
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: submitted };
  const result = await ctx.repo.update(parsed.data);
  if (!result.ok) {
    if (isPossibleDuplicate(result.error)) {
      return { needsConfirm: true, error: clientsCopy.editDuplicateConfirm, values: submitted };
    }
    return { error: clientErrorMessage(result.error), values: submitted };
  }
  revalidatePath(`/clientes/${parsed.data.id}`);
  return { message: clientsCopy.saved };
}

export async function addVehicleAction(prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  return stamp(await addVehicleActionImpl(prev, form));
}

async function addVehicleActionImpl(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  const ctx = await context("clientNew");
  if (!ctx) return { error: authCopy.forbidden };
  const submitted = values(form);
  const parsed = addVehicleSchema.safeParse({
    clientId: text(form, "clientId"),
    detailCenterId: ctx.centerId,
    requestId: text(form, "requestId"),
    make: text(form, "make"),
    model: text(form, "model"),
    year: text(form, "year"),
    plate: text(form, "plate"),
    identifier: text(form, "identifier"),
    notes: text(form, "vehicleNotes"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: submitted };
  const result = await ctx.repo.addVehicle(parsed.data);
  if (!result.ok) return { error: clientErrorMessage(result.error), values: submitted };
  revalidatePath(`/clientes/${parsed.data.clientId}`);
  return { message: clientsCopy.vehicleAdded };
}

/** Dar de baja un vehículo (vendido, error de captura…) con motivo. */
export async function deactivateVehicleAction(
  prev: ClientFormState,
  form: FormData,
): Promise<ClientFormState> {
  return stamp(await deactivateVehicleActionImpl(prev, form));
}

async function deactivateVehicleActionImpl(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  const ctx = await context("clientNew");
  if (!ctx) return { error: authCopy.forbidden };
  const clientId = text(form, "clientId");
  const submitted = values(form);
  const detail = await ctx.repo.get(clientId);
  if (!detail.ok) return { error: clientErrorMessage(detail.error) };
  const vehicle = detail.data.vehicles.find((v) => v.id === text(form, "vehicleId") && v.active);
  if (!vehicle) return { fields: { vehicleId: "Elige un vehículo" }, values: submitted };
  const parsed = updateVehicleSchema.safeParse({
    ...vehicle,
    identifier: vehicle.identifier ?? undefined,
    notes: vehicle.notes ?? undefined,
    active: false,
    reason: text(form, "vehicleReason"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { fields: { vehicleReason: errors.reason ?? Object.values(errors)[0] ?? "" }, values: submitted };
  }
  const result = await ctx.repo.updateVehicle(parsed.data);
  if (!result.ok) return { error: clientErrorMessage(result.error), values: submitted };
  revalidatePath(`/clientes/${clientId}`);
  return { message: clientsCopy.vehicleUpdated };
}
