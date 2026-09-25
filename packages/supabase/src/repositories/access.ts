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

    setCenterMembership(command) {
      const parsed = setCenterMembershipSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const { detailCenterId, userId, role, active, reason } = parsed.data;
      return run(
        () =>
          client
            .rpc("set_center_membership", {
              p_detail_center_id: detailCenterId,
              p_user_id: userId,
              p_role: role,
              p_active: active,
              p_reason: reason,
            })
            .single(),
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
          client
            .rpc("set_role_assignment", {
              p_organization_id: organizationId,
              p_user_id: userId,
              p_role: role,
              p_active: active,
              p_reason: reason,
            })
            .single(),
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
