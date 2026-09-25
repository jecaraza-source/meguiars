"use server";

import { authCopy, guardScreen } from "@meguiars/domain";
import {
  createDetailCenterRepository,
  loadAuthState,
  sendPasswordReset,
  setActiveCenter,
  signInWithPassword,
  signOut,
  updatePassword,
} from "@meguiars/supabase";
import {
  activeCenterSchema,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateDetailCenterSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { GUARD_REDIRECTS, safeNext } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  fields?: Record<string, string>;
  message?: string;
}

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no está configurado");
  return supabase;
}

/** URL pública de la app: NEXT_PUBLIC_SITE_URL o el origen de la petición. */
async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  const supabase = await client();
  const result = await signInWithPassword(supabase, parsed.data);
  if (!result.ok) return { error: result.error.message };

  const state = await loadAuthState(supabase);
  if (state.ok && state.data.status === "disabled") {
    await signOut(supabase);
    redirect(GUARD_REDIRECTS.disabled);
  }
  redirect(safeNext(form.get("next")?.toString()));
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const result = await sendPasswordReset(
    await client(),
    parsed.data.email,
    `${await siteUrl()}/auth/confirm?next=/restablecer`,
  );
  if (!result.ok) return { error: result.error.message };
  // Mismo mensaje exista o no el correo.
  return { message: authCopy.forgotSent };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await getAuthState();
  if (state.status !== "signed_in") redirect(GUARD_REDIRECTS.login);
  const parsed = resetPasswordSchema.safeParse({
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const result = await updatePassword(await client(), parsed.data.password);
  if (!result.ok) return { error: result.error.message };
  return { message: authCopy.resetDone };
}

export async function logoutAction(): Promise<void> {
  await signOut(await client());
  redirect(GUARD_REDIRECTS.login);
}

export async function selectCenterAction(form: FormData): Promise<void> {
  const parsed = activeCenterSchema.safeParse({ detailCenterId: form.get("detailCenterId") });
  if (!parsed.success) redirect(GUARD_REDIRECTS.select_center);
  const result = await setActiveCenter(await client(), parsed.data.detailCenterId);
  if (!result.ok) redirect(GUARD_REDIRECTS.select_center);
  // Todo el layout depende del centro activo: se recalcula sin datos del anterior.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function editCenterAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await getAuthState();
  const guard = guardScreen(state, "editCenter");
  if (!guard.allow) return { error: authCopy.forbidden };
  if (state.status !== "signed_in" || !state.activeCenterId) return { error: authCopy.forbidden };

  const parsed = updateDetailCenterSchema.safeParse({
    id: state.activeCenterId,
    name: form.get("name"),
    timezone: form.get("timezone"),
    reason: form.get("reason"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  // RLS vuelve a validar: sin admin_socio la RPC devuelve permission_denied.
  const result = await createDetailCenterRepository(await client()).update(parsed.data);
  if (!result.ok) return { error: result.error.message };
  revalidatePath("/", "layout");
  return { message: authCopy.saved };
}
