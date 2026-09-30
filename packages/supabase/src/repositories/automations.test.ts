import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createAutomationsRepository } from "./automations";

const U = "11111111-1111-4111-8111-111111111111";

function fakeClient(data: unknown) {
  const rpc = vi.fn(() => Promise.resolve({ data, error: null }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const base = {
  organizationId: U,
  detailCenterId: U,
  name: "Recompra de lavado",
  trigger: "mantenimiento" as const,
  delayDays: 30,
  serviceIds: [],
  leadSources: [],
  dueInDays: 1,
  messageTemplate: "Hola {nombre}, ya toca tu {servicio}",
  cooldownDays: 30,
  maxPerRun: 50,
  contactFrom: "09:00",
  contactTo: "19:00",
  reason: "Alta de regla",
};

describe("repositorio de automatizaciones", () => {
  it("un mensaje con precios inventados no llega a la base", async () => {
    const { client, rpc } = fakeClient({ id: U });
    const repo = createAutomationsRepository(client);
    const bad = await repo.save({ ...base, messageTemplate: "Hola {nombre}, sólo {precio}" });
    expect(bad.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(await repo.save(base)).toEqual({ ok: true, data: { id: U } });
    expect(rpc).toHaveBeenCalledWith(
      "upsert_automation",
      expect.objectContaining({
        p_trigger: "mantenimiento",
        p_assign_to: null,
        p_id: null,
        p_delay_days: 30,
      }),
    );
  });

  it("vista previa y corrida devuelven los omitidos por motivo", async () => {
    const { client, rpc } = fakeClient({
      id: U,
      mode: "vista_previa",
      started_at: "2026-10-01T14:00:00Z",
      finished_at: "2026-10-01T14:00:01Z",
      evaluated: 3,
      created: 2,
      stopped: 0,
      skipped: { sin_consentimiento: 1 },
      error: null,
    });
    const r = await createAutomationsRepository(client).run(U, true);
    expect(rpc).toHaveBeenCalledWith("run_automation_now", { p_id: U, p_preview: true });
    expect(r.ok && r.data).toMatchObject({
      mode: "vista_previa",
      created: 2,
      skipped: { sin_consentimiento: 1 },
    });
  });

  it("activar exige motivo", async () => {
    const { client, rpc } = fakeClient(null);
    const repo = createAutomationsRepository(client);
    expect((await repo.setActive(U, 1, true, "")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect((await repo.setActive(U, 1, true, "Arranque")).ok).toBe(true);
  });
});
