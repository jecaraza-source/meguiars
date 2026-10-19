import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createReportEmailsRepository } from "./report-emails";

const O = "00000000-0000-4000-8000-000000000001";
const S = "bbbbbbbb-0000-4000-8000-000000000000";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const row = {
  id: S,
  organization_id: O,
  name: "Resumen semanal",
  frequency: "semanal",
  center_ids: null,
  recipients: ["dir@meguiars.mx"],
  active: true,
  version: 1,
  created_by: null,
  created_at: "2026-10-19T00:00:00Z",
  updated_at: "2026-10-19T00:00:00Z",
};

describe("repositorio de reportes por correo", () => {
  it("valida antes de llamar y manda null cuando son todos los centros", async () => {
    const { client, rpc } = fake({ data: row, error: null });
    const repo = createReportEmailsRepository(client);
    const input = {
      organizationId: O,
      id: null,
      version: null,
      name: "Resumen semanal",
      frequency: "semanal" as const,
      centerIds: null,
      recipients: ["Dir@Meguiars.mx"],
      active: true,
      reason: "Alta del reporte",
    };
    expect((await repo.save({ ...input, recipients: [] })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const r = await repo.save(input);
    expect(r.ok && r.data.frequency).toBe("semanal");
    expect(rpc).toHaveBeenCalledWith("save_report_subscription", {
      p_organization_id: O,
      p_id: null,
      p_version: null,
      p_name: "Resumen semanal",
      p_frequency: "semanal",
      p_center_ids: null,
      p_recipients: ["dir@meguiars.mx"],
      p_active: true,
      p_reason: "Alta del reporte",
    });
  });

  it("registrar un envío ya enviado devuelve null", async () => {
    const empty = Object.fromEntries(Object.keys(row).map((k) => [k, null]));
    const { client } = fake({ data: empty, error: null });
    const r = await createReportEmailsRepository(client).recordDelivery({
      subscriptionId: S,
      source: "cron",
      period: { from: "2026-10-12", to: "2026-10-18" },
      status: "enviado",
      providerMessageId: "m1",
      error: null,
    });
    expect(r).toEqual({ ok: true, data: null });
  });

  it("borrar pide motivo y traduce errores", async () => {
    const { client, rpc } = fake({ data: null, error: { code: "42501", message: "Sin permiso" } });
    const repo = createReportEmailsRepository(client);
    expect((await repo.remove(S, "")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const r = await repo.remove(S, "Ya no se usa");
    expect(r.ok).toBe(false);
    expect(rpc).toHaveBeenCalledWith("delete_report_subscription", { p_id: S, p_reason: "Ya no se usa" });
  });
});
