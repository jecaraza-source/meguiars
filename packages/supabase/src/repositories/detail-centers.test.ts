import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createDetailCenterRepository } from "./detail-centers";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "CDMX-01",
  name: "Centro CDMX",
  timezone: "America/Mexico_City",
  created_at: "2026-09-22T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
};

/** Doble mínimo del cliente: sólo lo que usa el adaptador. */
function fakeClient(response: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(response);
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  const single = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => ({ single }));
  return { client: { from, rpc } as unknown as MeguiarsSupabaseClient, from, rpc };
}

describe("DetailCenterRepository (Supabase)", () => {
  it("lista centros visibles y los mapea al dominio", async () => {
    const { client, from } = fakeClient({ data: [ROW], error: null });
    const result = await createDetailCenterRepository(client).listVisible();
    expect(from).toHaveBeenCalledWith("detail_centers");
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: ROW.id,
          code: "CDMX-01",
          name: "Centro CDMX",
          timezone: "America/Mexico_City",
          createdAt: ROW.created_at,
          updatedAt: ROW.updated_at,
        },
      ],
    });
  });

  it("traduce el rechazo de RLS a permission_denied", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42501", message: "permission denied" } });
    const result = await createDetailCenterRepository(client).listVisible();
    expect(result.ok || result.error.kind).toBe("permission_denied");
  });

  it("valida el comando antes de llamar a la RPC", async () => {
    const { client, rpc } = fakeClient({ data: ROW, error: null });
    const result = await createDetailCenterRepository(client).update({
      id: ROW.id,
      name: "Centro",
      timezone: "Mars/Olympus",
      reason: "",
    });
    expect(result.ok || result.error.kind).toBe("validation");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("actualiza mediante la RPC con motivo", async () => {
    const { client, rpc } = fakeClient({ data: { ...ROW, name: "Centro Polanco" }, error: null });
    const result = await createDetailCenterRepository(client).update({
      id: ROW.id,
      name: " Centro Polanco ",
      timezone: "America/Mexico_City",
      reason: "Cambio de sede",
    });
    expect(rpc).toHaveBeenCalledWith("update_detail_center", {
      p_id: ROW.id,
      p_name: "Centro Polanco",
      p_timezone: "America/Mexico_City",
      p_reason: "Cambio de sede",
    });
    expect(result.ok && result.data.name).toBe("Centro Polanco");
  });

  it("asigna membresías mediante la RPC", async () => {
    const membership = {
      detail_center_id: ROW.id,
      user_id: "0b7a4c2e-3d1f-4e5a-8b9c-7d6e5f4a3b21",
      role: "technician",
      active: true,
      created_at: ROW.created_at,
      updated_at: ROW.updated_at,
    };
    const { client, rpc } = fakeClient({ data: membership, error: null });
    const result = await createDetailCenterRepository(client).setMembership({
      detailCenterId: ROW.id,
      userId: membership.user_id,
      role: "technician",
      active: true,
      reason: "Alta de técnico",
    });
    expect(rpc).toHaveBeenCalledWith(
      "set_center_membership",
      expect.objectContaining({ p_role: "technician" }),
    );
    expect(result).toEqual({
      ok: true,
      data: { detailCenterId: ROW.id, userId: membership.user_id, role: "technician", active: true },
    });
  });

  it("reporta servicio no disponible si la red falla", async () => {
    const client = {
      from: () => ({
        select: () => ({ order: () => Promise.reject(new TypeError("Failed to fetch")) }),
      }),
    } as unknown as MeguiarsSupabaseClient;
    const result = await createDetailCenterRepository(client).listVisible();
    expect(result.ok || result.error.kind).toBe("unavailable");
  });
});
