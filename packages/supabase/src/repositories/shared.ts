import { fail, type DetailCenter, type Result } from "@meguiars/domain";
import type { z } from "zod";
import type { Tables } from "../database.types";
import { toRepoError } from "../errors";

export const toDetailCenter = (
  row: Pick<
    Tables<"detail_centers">,
    "id" | "organization_id" | "code" | "name" | "timezone" | "active" | "created_at" | "updated_at"
  >,
): DetailCenter => ({
  id: row.id,
  organizationId: row.organization_id,
  code: row.code,
  name: row.name,
  timezone: row.timezone,
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function invalid<T>(error: z.ZodError): Result<T> {
  return fail("validation", error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}

/** Ejecuta una llamada a Supabase y traduce errores de PostgREST o de red. */
export async function run<TRow, T>(
  call: () => PromiseLike<{ data: TRow | null; error: unknown }>,
  map: (data: NonNullable<TRow>) => T,
): Promise<Result<T>> {
  try {
    const { data, error } = await call();
    if (error) return { ok: false, error: toRepoError(error) };
    if (data === null || data === undefined) return fail("not_found", "Sin datos");
    return { ok: true, data: map(data as NonNullable<TRow>) };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}
