import type { AccessRepository, CenterAccess } from "@meguiars/domain";
import { setCenterMembershipSchema, setRoleAssignmentSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Tables } from "../database.types";
import { invalid, run, toDetailCenter } from "./shared";

type MyCenterRow = Database["public"]["Functions"]["my_detail_centers"]["Returns"][number];

const toCenterAccess = (row: MyCenterRow): CenterAccess => ({
  center: toDetailCenter({ ...row, created_at: "", updated_at: "" }),
  organizationName: row.organization_name,
  roles: row.roles,
  corporateRoles: row.corporate_roles,
});

/** Adaptador Supabase del puerto `AccessRepository`. */
export function createAccessRepository(client: MeguiarsSupabaseClient): AccessRepository {
  return {
    listMyAccess() {
      return run(
        () => client.rpc("my_detail_centers"),
        (rows: MyCenterRow[]) => rows.map(toCenterAccess),
      );
    },

    async listCenterMembers(detailCenterId) {
      const members = await run(
        () =>
          client
            .from("user_detail_centers")
            .select("user_id, role, active")
            .eq("detail_center_id", detailCenterId)
            .order("role"),
        (rows: Pick<Tables<"user_detail_centers">, "user_id" | "role" | "active">[]) => rows,
      );
      if (!members.ok) return members;
      const ids = members.data.map((m) => m.user_id);
      const names = new Map<string, string | null>();
      if (ids.length > 0) {
        const profiles = await run(
          () => client.from("profiles").select("id, full_name").in("id", ids),
          (rows: Pick<Tables<"profiles">, "id" | "full_name">[]) => rows,
        );
        if (!profiles.ok) return profiles;
        for (const p of profiles.data) names.set(p.id, p.full_name);
      }
      return {
        ok: true,
        data: members.data.map((m) => ({
          userId: m.user_id,
          fullName: names.get(m.user_id) ?? null,
          role: m.role,
          active: m.active,
        })),
      };
    },

    setCenterMembership(command) {
      const parsed = setCenterMembershipSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const { detailCenterId, userId, role, active, reason } = parsed.data;
      return run(
        () =>
          client.rpc("set_center_membership", {
            p_detail_center_id: detailCenterId,
            p_user_id: userId,
            p_role: role,
            p_active: active,
            p_reason: reason,
          }),
        (row: Tables<"user_detail_centers">) => ({
          detailCenterId: row.detail_center_id,
          userId: row.user_id,
          role: row.role,
          active: row.active,
        }),
      );
    },

    setRoleAssignment(command) {
      const parsed = setRoleAssignmentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const { organizationId, userId, role, active, reason } = parsed.data;
      return run(
        () =>
          client.rpc("set_role_assignment", {
            p_organization_id: organizationId,
            p_user_id: userId,
            p_role: role,
            p_active: active,
            p_reason: reason,
          }),
        (row: Tables<"role_assignments">) => ({
          id: row.id,
          organizationId: row.organization_id,
          userId: row.user_id,
          role: row.role,
          active: row.active,
        }),
      );
    },
  };
}
