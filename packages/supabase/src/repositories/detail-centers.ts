import {
  fail,
  ok,
  type CenterMembership,
  type DetailCenter,
  type DetailCenterRepository,
  type Result,
} from "@meguiars/domain";
import { setMembershipSchema, updateDetailCenterSchema } from "@meguiars/validation";
import type { z } from "zod";
import type { MeguiarsSupabaseClient } from "../client";
import type { Tables } from "../database.types";
import { toRepoError } from "../errors";

const toDetailCenter = (row: Tables<"detail_centers">): DetailCenter => ({
  id: row.id,
  code: row.code,
  name: row.name,
  timezone: row.timezone,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toMembership = (row: Tables<"center_memberships">): CenterMembership => ({
  detailCenterId: row.detail_center_id,
  userId: row.user_id,
  role: row.role,
  active: row.active,
});

function invalid<T>(error: z.ZodError): Result<T> {
  return fail("validation", error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}

/** Adaptador Supabase del puerto `DetailCenterRepository`. */
export function createDetailCenterRepository(client: MeguiarsSupabaseClient): DetailCenterRepository {
  return {
    async listVisible() {
      try {
        const { data, error } = await client.from("detail_centers").select("*").order("name");
        if (error) return { ok: false, error: toRepoError(error) };
        return ok(data.map(toDetailCenter));
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    async update(command) {
      const parsed = updateDetailCenterSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const { id, name, timezone, reason } = parsed.data;
      try {
        const { data, error } = await client
          .rpc("update_detail_center", { p_id: id, p_name: name, p_timezone: timezone, p_reason: reason })
          .single();
        if (error) return { ok: false, error: toRepoError(error) };
        return ok(toDetailCenter(data));
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    async setMembership(command) {
      const parsed = setMembershipSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const { detailCenterId, userId, role, active, reason } = parsed.data;
      try {
        const { data, error } = await client
          .rpc("set_center_membership", {
            p_detail_center_id: detailCenterId,
            p_user_id: userId,
            p_role: role,
            p_active: active,
            p_reason: reason,
          })
          .single();
        if (error) return { ok: false, error: toRepoError(error) };
        return ok(toMembership(data));
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },
  };
}
