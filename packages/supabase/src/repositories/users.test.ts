import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createUserAccountsAdmin, createUsersRepository } from "./users";

const O = "00000000-0000-4000-8000-000000000001";
const U = "aaaaaaaa-0000-4000-8000-000000000000";

describe("repositorio de usuarios", () => {
  it("lista con org_users y convierte los roles por centro", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: U,
          email: "e@x.com",
          full_name: "Elena",
          active: true,
          last_sign_in_at: null,
          created_at: null,
          corporate_roles: [],
          center_roles: [{ detail_center_id: "c1", center_name: "CDMX", role: "encargado", active: true }],
          other_org: false,
        },
      ],
      error: null,
    });
    const r = await createUsersRepository({ rpc } as unknown as MeguiarsSupabaseClient).list(O);
    expect(rpc).toHaveBeenCalledWith("org_users", { p_organization_id: O });
    expect(r).toMatchObject({
      ok: true,
      data: [{ userId: U, centerRoles: [{ detailCenterId: "c1", centerName: "CDMX", role: "encargado" }] }],
    });
  });
  it("desactivar exige motivo antes de llamar a la base", async () => {
    const rpc = vi.fn();
    const r = await createUsersRepository({ rpc } as unknown as MeguiarsSupabaseClient).setDisabled(
      O,
      U,
      true,
      "",
    );
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("alta con correo confirmado y nombre; correo repetido = conflicto", async () => {
    const createUser = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: { id: U } }, error: null })
      .mockResolvedValueOnce({
        data: { user: null },
        error: { status: 422, message: "A user with this email address has already been registered" },
      });
    const admin = createUserAccountsAdmin({
      auth: { admin: { createUser } },
    } as unknown as MeguiarsSupabaseClient);
    expect(await admin.create({ email: "e@x.com", password: "segura123", fullName: "Elena" })).toEqual({
      ok: true,
      data: { userId: U },
    });
    expect(createUser).toHaveBeenCalledWith({
      email: "e@x.com",
      password: "segura123",
      email_confirm: true,
      user_metadata: { full_name: "Elena" },
    });
    expect(await admin.create({ email: "e@x.com", password: "segura123", fullName: "Elena" })).toMatchObject({
      ok: false,
      error: { kind: "conflict" },
    });
  });
});
