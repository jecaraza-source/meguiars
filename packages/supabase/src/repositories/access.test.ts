import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createAccessRepository } from "./access";

const ORG = "00000000-0000-4000-8000-00000000d3e0";
const CENTER = "11111111-1111-4111-8111-111111111111";
const USER = "0b7a4c2e-3d1f-4e5a-8b9c-7d6e5f4a3b21";

/** Doble mínimo: `rpc(name, args)` → promesa, o `.single()` → promesa. */
function fakeClient(response: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => Object.assign(Promise.resolve(response), { single }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("AccessRepository (Supabase)", () => {
  it("lista el acceso del usuario con roles por centro y corporativos", async () => {
    const { client, rpc } = fakeClient({
      data: [
        {
          id: CENTER,
          organization_id: ORG,
          organization_name: "Demo",
          code: "CDMX-01",
          name: "Centro CDMX",
          timezone: "America/Mexico_City",
          active: true,
          roles: ["admin_socio", "contador"],
          corporate_roles: ["contador"],
        },
      ],
      error: null,
    });
    const result = await createAccessRepository(client).listMyAccess();
    expect(rpc).toHaveBeenCalledWith("my_detail_centers");
    expect(result.ok && result.data[0]).toMatchObject({
      center: { id: CENTER, organizationId: ORG, code: "CDMX-01", active: true },
      organizationName: "Demo",
      roles: ["admin_socio", "contador"],
      corporateRoles: ["contador"],
    });
  });

  it("sin sesión, el rechazo de permisos llega como permission_denied", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42501", message: "permission denied" } });
    const result = await createAccessRepository(client).listMyAccess();
    expect(result.ok || result.error.kind).toBe("permission_denied");
  });

  it("asigna membresía de centro mediante la RPC con motivo", async () => {
    const row = { detail_center_id: CENTER, user_id: USER, role: "encargado", active: true };
    const { client, rpc } = fakeClient({ data: row, error: null });
    const result = await createAccessRepository(client).setCenterMembership({
      detailCenterId: CENTER,
      userId: USER,
      role: "encargado",
      active: true,
      reason: "Alta de encargado",
    });
    expect(rpc).toHaveBeenCalledWith("set_center_membership", {
      p_detail_center_id: CENTER,
      p_user_id: USER,
      p_role: "encargado",
      p_active: true,
      p_reason: "Alta de encargado",
    });
    expect(result).toEqual({
      ok: true,
      data: { detailCenterId: CENTER, userId: USER, role: "encargado", active: true },
    });
  });

  it("asigna rol corporativo mediante la RPC", async () => {
    const row = { id: "r1", organization_id: ORG, user_id: USER, role: "contador", active: true };
    const { client, rpc } = fakeClient({ data: row, error: null });
    const result = await createAccessRepository(client).setRoleAssignment({
      organizationId: ORG,
      userId: USER,
      role: "contador",
      active: true,
      reason: "Contador externo",
    });
    expect(rpc).toHaveBeenCalledWith("set_role_assignment", expect.objectContaining({ p_role: "contador" }));
    expect(result.ok && result.data).toEqual({
      id: "r1",
      organizationId: ORG,
      userId: USER,
      role: "contador",
      active: true,
    });
  });

  it("valida antes de llamar: rol del esquema anterior o motivo vacío", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    const repo = createAccessRepository(client);
    const legacy = await repo.setCenterMembership({
      detailCenterId: CENTER,
      userId: USER,
      role: "owner" as never,
      active: true,
      reason: "Alta",
    });
    const noReason = await repo.setRoleAssignment({
      organizationId: ORG,
      userId: USER,
      role: "contador",
      active: true,
      reason: " ",
    });
    expect(legacy.ok || legacy.error.kind).toBe("validation");
    expect(noReason.ok || noReason.error.kind).toBe("validation");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("el último admin_socio no puede retirarse: llega como validation", async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: "23514", message: "al menos un admin_socio" },
    });
    const result = await createAccessRepository(client).setRoleAssignment({
      organizationId: ORG,
      userId: USER,
      role: "admin_socio",
      active: false,
      reason: "Me retiro",
    });
    expect(result.ok || result.error.kind).toBe("validation");
  });
});
