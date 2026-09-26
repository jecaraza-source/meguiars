import type { DetailCenterRepository } from "@meguiars/domain";
import { updateDetailCenterSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import { invalid, run, toDetailCenter } from "./shared";

/** Adaptador Supabase del puerto `DetailCenterRepository`. */
export function createDetailCenterRepository(client: MeguiarsSupabaseClient): DetailCenterRepository {
  return {
    listVisible() {
      return run(
        () => client.from("detail_centers").select("*").order("name"),
        (rows) => rows.map(toDetailCenter),
      );
    },

    update(command) {
      const parsed = updateDetailCenterSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const { id, name, timezone, reason } = parsed.data;
      return run(
        () =>
          client.rpc("update_detail_center", {
            p_id: id,
            p_name: name,
            p_timezone: timezone,
            p_reason: reason,
          }),
        toDetailCenter,
      );
    },
  };
}
