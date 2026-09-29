import {
  fail,
  type AppRole,
  type OrgUser,
  type OrgUserCenterRole,
  type UserAccountsAdmin,
  type UsersRepository,
} from "@meguiars/domain";
import { setUserDisabledSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type OrgUserRow = Database["public"]["Functions"]["org_users"]["Returns"][number];

const toOrgUser = (r: OrgUserRow): OrgUser => ({
  userId: r.user_id,
  email: r.email,
  fullName: r.full_name,
  active: r.active,
  lastSignInAt: r.last_sign_in_at,
  createdAt: r.created_at,
  corporateRoles: r.corporate_roles,
  centerRoles: (Array.isArray(r.center_roles) ? r.center_roles : []).map((c) => {
    const o = c as Record<string, unknown>;
    return {
      detailCenterId: String(o.detail_center_id),
      centerName: String(o.center_name),
      role: o.role as AppRole,
      active: Boolean(o.active),
    } satisfies OrgUserCenterRole;
  }),
  otherOrg: r.other_org,
});

async function runVoid(call: () => PromiseLike<{ error: unknown }>) {
  try {
    const { error } = await call();
    return error ? { ok: false as const, error: toRepoError(error) } : { ok: true as const, data: undefined };
  } catch (e) {
    return { ok: false as const, error: toRepoError(e) };
  }
}

/** Usuarios de la organización con la sesión del admin (RPC con permisos y auditoría). */
export function createUsersRepository(client: MeguiarsSupabaseClient): UsersRepository {
  return {
    list(organizationId) {
      return run(
        () => client.rpc("org_users", { p_organization_id: organizationId }),
        (rows) => rows.map(toOrgUser),
      );
    },
    async canAdmin(organizationId, userId) {
      const r = await client.rpc("can_admin_user", { p_organization_id: organizationId, p_user_id: userId });
      return r.error ? { ok: false, error: toRepoError(r.error) } : { ok: true, data: r.data === true };
    },
    setDisabled(organizationId, userId, disabled, reason) {
      const parsed = setUserDisabledSchema.safeParse({ userId, disabled, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return runVoid(() =>
        client.rpc("admin_set_user_disabled", {
          p_organization_id: organizationId,
          p_user_id: userId,
          p_disabled: disabled,
          p_reason: parsed.data.reason,
        }),
      );
    },
  };
}

const authError = (e: { message?: string; code?: string; status?: number } | null) =>
  fail(
    e?.status === 422 || /already/i.test(e?.message ?? "") ? "conflict" : "unknown",
    e?.message ?? "Error de autenticación",
  );

/**
 * Cuentas con la Auth Admin API. Recibe el cliente con la llave de servicio:
 * SÓLO en el servidor web, después de comprobar permisos con la sesión.
 */
export function createUserAccountsAdmin(serviceClient: MeguiarsSupabaseClient): UserAccountsAdmin {
  return {
    async create({ email, password, fullName }) {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) return authError(error);
      return { ok: true, data: { userId: data.user.id } };
    },
    async setPassword(userId, password) {
      const { error } = await serviceClient.auth.admin.updateUserById(userId, { password });
      return error ? authError(error) : { ok: true, data: undefined };
    },
    async remove(userId) {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      return error ? authError(error) : { ok: true, data: undefined };
    },
  };
}
