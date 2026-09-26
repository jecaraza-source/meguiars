import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createExecutionRepository } from "./execution";

const ORG = "00000000-0000-4000-8000-00000000d3e0";
const CENTER = "11111111-1111-4111-8111-111111111111";
const ORDER = "0d000000-0000-4000-8000-000000000001";
const FILE = "aaaaaaaa-1111-4111-8111-000000000001";
const ITEM = "0e100000-0000-4000-8000-000000000001";

function fake(
  upload: { error: unknown },
  rpcResponse: { data: unknown; error: unknown } = { data: { id: "ev1" }, error: null },
) {
  const up = vi.fn().mockResolvedValue({ data: upload.error ? null : { path: "x" }, ...upload });
  const rpc = vi.fn().mockResolvedValue(rpcResponse);
  const client = {
    rpc,
    storage: { from: vi.fn(() => ({ upload: up })) },
  } as unknown as MeguiarsSupabaseClient;
  return { client, rpc, up };
}

const command = {
  order: { organizationId: ORG, detailCenterId: CENTER, id: ORDER },
  fileId: FILE,
  file: new ArrayBuffer(8),
  contentType: "image/jpeg" as const,
  sizeBytes: 245_000,
  width: 1600,
  height: 1200,
  kind: "antes" as const,
  itemId: ITEM,
};

describe("ExecutionRepository (Supabase)", () => {
  it("sube la foto a la ruta privada <org>/<centro>/<OS>/<archivo> y la registra", async () => {
    const { client, rpc, up } = fake({ error: null });
    const result = await createExecutionRepository(client).uploadEvidence(command);
    expect(up).toHaveBeenCalledWith(`${ORG}/${CENTER}/${ORDER}/${FILE}.jpg`, command.file, {
      contentType: "image/jpeg",
      upsert: false,
    });
    expect(rpc).toHaveBeenCalledWith("register_service_order_evidence", {
      p_order_id: ORDER,
      p_storage_path: `${ORG}/${CENTER}/${ORDER}/${FILE}.jpg`,
      p_kind: "antes",
      p_content_type: "image/jpeg",
      p_size_bytes: 245_000,
      p_width: 1600,
      p_height: 1200,
      p_item_id: ITEM,
    });
    expect(result).toEqual({ ok: true, data: { id: "ev1" } });
  });

  it("reintento: si el archivo ya existe se registra igual (idempotente)", async () => {
    const { client, rpc } = fake({ error: { message: "The resource already exists", statusCode: "409" } });
    expect((await createExecutionRepository(client).uploadEvidence(command)).ok).toBe(true);
    expect(rpc).toHaveBeenCalled();
  });

  it("Storage niega por RLS (otro centro): sin permiso y sin registrar", async () => {
    const { client, rpc } = fake({
      error: { message: "new row violates row-level security policy", statusCode: "403" },
    });
    expect(await createExecutionRepository(client).uploadEvidence(command)).toMatchObject({
      ok: false,
      error: { kind: "permission_denied" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("una foto de más de 5 MB no se sube", async () => {
    const { client, up } = fake({ error: null });
    const result = await createExecutionRepository(client).uploadEvidence({
      ...command,
      sizeBytes: 6_000_000,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(up).not.toHaveBeenCalled();
  });

  it("ejecución de línea y consumo por RPC", async () => {
    const { client, rpc } = fake(
      { error: null },
      { data: { id: ITEM, work_status: "en_proceso" }, error: null },
    );
    const repo = createExecutionRepository(client);
    expect(await repo.setItemWork({ itemId: ITEM, status: "en_proceso" })).toEqual({
      ok: true,
      data: { id: ITEM, workStatus: "en_proceso" },
    });
    expect(rpc).toHaveBeenLastCalledWith("set_service_order_item_work", {
      p_item_id: ITEM,
      p_status: "en_proceso",
    });
    await repo.recordConsumption({ itemId: ITEM, inventoryItemId: FILE, actualQuantity: 120 });
    expect(rpc).toHaveBeenLastCalledWith("record_service_order_consumption", {
      p_item_id: ITEM,
      p_inventory_item_id: FILE,
      p_actual_quantity: 120,
    });
  });
});
