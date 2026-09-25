import { authCopy } from "@meguiars/domain";
import { describe, expect, it, vi } from "vitest";
import { loadAuthState, sendPasswordReset, setActiveCenter, signInWithPassword } from "./auth";
import type { MeguiarsSupabaseClient } from "./client";

const USER = { id: "u1", email: "ana@demo.mx" };
const centerRow = (id: string, roles: string[]) => ({
  id,
  organization_id: "o1",
  organization_name: "Demo",
  code: id,
  name: id,
  timezone: "UTC",
  active: true,
  roles,
  corporate_roles: [],
});

function fakeClient(opts: {
  user?: typeof USER | null;
  profile?: {
    id: string;
    full_name: string | null;
    active: boolean;
    last_detail_center_id: string | null;
  } | null;
  centers?: unknown[];
  signIn?: { data: unknown; error: unknown };
  reset?: { error: unknown };
  rpc?: { data: unknown; error: unknown };
}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: opts.profile ?? null, error: null });
  const rpc = vi.fn((name: string) =>
    name === "my_detail_centers"
      ? Promise.resolve({ data: opts.centers ?? [], error: null })
      : Promise.resolve(opts.rpc ?? { data: null, error: null }),
  );
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: opts.user ?? null }, error: opts.user ? null : { code: "x" } }),
      signInWithPassword: vi.fn().mockResolvedValue(opts.signIn),
      resetPasswordForEmail: vi.fn().mockResolvedValue(opts.reset ?? { error: null }),
    },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
    rpc,
  };
  return { client: client as unknown as MeguiarsSupabaseClient, raw: client };
}

describe("loadAuthState", () => {
  it("sin usuario válido: signed_out", async () => {
    const { client } = fakeClient({ user: null });
    expect(await loadAuthState(client)).toEqual({ ok: true, data: { status: "signed_out" } });
  });

  it("perfil deshabilitado: disabled, sin consultar accesos", async () => {
    const { client, raw } = fakeClient({
      user: USER,
      profile: { id: "u1", full_name: "Ana", active: false, last_detail_center_id: null },
    });
    expect(await loadAuthState(client)).toEqual({
      ok: true,
      data: { status: "disabled", email: "ana@demo.mx" },
    });
    expect(raw.rpc).not.toHaveBeenCalled();
  });

  it("usa el centro guardado en el perfil cuando sigue siendo válido", async () => {
    const { client } = fakeClient({
      user: USER,
      profile: { id: "u1", full_name: "Ana", active: true, last_detail_center_id: "B" },
      centers: [centerRow("A", ["encargado"]), centerRow("B", ["contador"])],
    });
    const result = await loadAuthState(client);
    expect(result.ok && result.data.status === "signed_in" && result.data.activeCenterId).toBe("B");
  });
});

describe("acciones de sesión", () => {
  it("login con credenciales inválidas devuelve el mensaje genérico", async () => {
    const { client } = fakeClient({
      signIn: { data: { user: null, session: null }, error: { code: "invalid_credentials", status: 400 } },
    });
    const result = await signInWithPassword(client, { email: "x@y.mx", password: "mala" });
    expect(result.ok || result.error.message).toBe(authCopy.errors.invalidCredentials);
  });

  it("recuperación pasa la URL de retorno a Supabase", async () => {
    const { client, raw } = fakeClient({});
    await sendPasswordReset(client, "ana@demo.mx", "https://app/auth/confirm?next=/restablecer");
    expect(raw.auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@demo.mx", {
      redirectTo: "https://app/auth/confirm?next=/restablecer",
    });
  });

  it("fijar centro activo llama a la RPC y traduce el rechazo de RLS", async () => {
    const { client, raw } = fakeClient({
      rpc: { data: null, error: { code: "42501", message: "sin acceso" } },
    });
    const result = await setActiveCenter(client, "B");
    expect(raw.rpc).toHaveBeenCalledWith("set_active_center", { p_detail_center_id: "B" });
    expect(result.ok || result.error.kind).toBe("permission_denied");
  });
});
