"use server";

import {
  activeCenterAccess,
  guardScreen,
  USERS_COPY,
  usersErrorMessage,
  type AppRole,
} from "@meguiars/domain";
import { createAccessRepository, createUserAccountsAdmin, createUsersRepository } from "@meguiars/supabase";
import { fieldErrors, newUserSchema, setPasswordSchema } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type UsersFormState = ActionFormState;

/**
 * Sesión del admin corporativo. Toda acción comprueba primero con la sesión
 * (public.can_admin_user) y sólo después usa la llave de servicio, y sólo para
 * lo que la sesión no puede hacer: crear la cuenta y cambiar su contraseña.
 */
async function context(userId: string | null) {
  const state = await getAuthState();
  if (state.status !== "signed_in" || !guardScreen(state, "users").allow) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const organizationId = activeCenterAccess(state)!.center.organizationId;
  const users = createUsersRepository(supabase);
  const can = await users.canAdmin(organizationId, userId);
  if (!can.ok || !can.data) return null;
  return { state, organizationId, users, access: createAccessRepository(supabase) };
}

const done = (userId?: string) => {
  revalidatePath("/equipo/usuarios");
  if (userId) revalidatePath(`/equipo/usuarios/${userId}`);
};

export async function createUserAction(_prev: UsersFormState, form: FormData): Promise<UsersFormState> {
  const ctx = await context(null);
  if (!ctx) return stamp({ error: USERS_COPY.onlyCorporate });
  const parsed = newUserSchema.safeParse({
    organizationId: ctx.organizationId,
    fullName: text(form, "fullName"),
    email: text(form, "email"),
    password: text(form, "password"),
    confirmPassword: text(form, "confirmPassword"),
    accessKind: text(form, "accessKind"),
    role: text(form, "role"),
    centerIds: form.getAll("centerIds").filter((v): v is string => typeof v === "string"),
    reason: text(form, "reason"),
  });
  const keep = () => {
    const v = values(form, ["centerIds"]);
    delete v.password;
    delete v.confirmPassword;
    return v;
  };
  if (!parsed.success)
    return stamp({ ...validationState(fieldErrors(parsed.error), ["organizationId"], form), values: keep() });
  const service = createSupabaseServiceClient();
  if (!service) return stamp({ error: USERS_COPY.noServiceKey, values: keep() });
  const accounts = createUserAccountsAdmin(service);
  const v = parsed.data;
  const created = await accounts.create({ email: v.email, password: v.password, fullName: v.fullName });
  if (!created.ok) return stamp({ error: usersErrorMessage(created.error), values: keep() });
  const userId = created.data.userId;
  // El acceso se asigna con la sesión del admin (permisos y auditoría de la base).
  const results =
    v.accessKind === "corporativo"
      ? [
          await ctx.access.setRoleAssignment({
            organizationId: ctx.organizationId,
            userId,
            role: "admin_socio",
            active: true,
            reason: v.reason,
          }),
        ]
      : await Promise.all(
          v.centerIds.map((detailCenterId) =>
            ctx.access.setCenterMembership({
              detailCenterId,
              userId,
              role: v.role as AppRole,
              active: true,
              reason: v.reason,
            }),
          ),
        );
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) {
    await accounts.remove(userId);
    return stamp({
      error: `No se asignó el acceso; la cuenta no se creó. ${usersErrorMessage(failed.error)}`,
      values: keep(),
    });
  }
  done();
  redirect(`/equipo/usuarios/${userId}?hecho=creado`);
}

export async function setPasswordAction(_prev: UsersFormState, form: FormData): Promise<UsersFormState> {
  const parsed = setPasswordSchema.safeParse({
    userId: text(form, "userId"),
    password: text(form, "password"),
    confirmPassword: text(form, "confirmPassword"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["userId"], form));
  const ctx = await context(parsed.data.userId);
  if (!ctx) return stamp({ error: USERS_COPY.onlyCorporate });
  const service = createSupabaseServiceClient();
  if (!service) return stamp({ error: USERS_COPY.noServiceKey });
  const r = await createUserAccountsAdmin(service).setPassword(parsed.data.userId, parsed.data.password);
  if (!r.ok) return stamp({ error: usersErrorMessage(r.error) });
  return stamp({ message: "Contraseña actualizada." });
}

export async function setUserDisabledAction(_prev: UsersFormState, form: FormData): Promise<UsersFormState> {
  const userId = text(form, "userId");
  const ctx = await context(userId);
  if (!ctx) return stamp({ error: USERS_COPY.onlyCorporate });
  const disabled = text(form, "disabled") === "true";
  const r = await ctx.users.setDisabled(ctx.organizationId, userId, disabled, text(form, "reason"));
  if (!r.ok) return stamp({ error: usersErrorMessage(r.error) });
  done(userId);
  return stamp({ message: disabled ? "Usuario desactivado." : "Usuario reactivado." });
}

/** Asigna, cambia o quita (active=false) el rol en un centro; o el rol de admin corporativo. */
export async function setUserRoleAction(_prev: UsersFormState, form: FormData): Promise<UsersFormState> {
  const userId = text(form, "userId");
  const ctx = await context(null);
  if (!ctx) return stamp({ error: USERS_COPY.onlyCorporate });
  const active = text(form, "active") !== "false";
  const reason = text(form, "reason");
  const scope = text(form, "scope");
  if (scope === "corporativo" && !active && userId === ctx.state.user.id)
    return stamp({ error: "No puedes quitarte tu propio rol de admin corporativo." });
  const r =
    scope === "corporativo"
      ? await ctx.access.setRoleAssignment({
          organizationId: ctx.organizationId,
          userId,
          role: "admin_socio",
          active,
          reason,
        })
      : await ctx.access.setCenterMembership({
          detailCenterId: text(form, "detailCenterId"),
          userId,
          role: text(form, "role") as AppRole,
          active,
          reason,
        });
  if (!r.ok)
    return stamp({
      error: usersErrorMessage(r.error),
      fields: r.error.kind === "validation" ? { reason: r.error.message } : {},
    });
  done(userId);
  return stamp({ message: active ? "Rol asignado." : "Rol retirado." });
}
