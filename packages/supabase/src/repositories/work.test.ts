import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createMyWorkRepository, parseMyWork } from "./work";

const ORG = "00000000-0000-4000-8000-00000000d3e0";
const CENTER = "11111111-1111-4111-8111-111111111111";
const ORDER = "0d000000-0000-4000-8000-000000000001";
const ITEM = "0e100000-0000-4000-8000-000000000001";
const FILE = "aaaaaaaa-1111-4111-8111-000000000001";
const TECH = "0f000000-0000-4000-8000-000000000001";
const USER = "0a000000-0000-4000-8000-000000000001";

const DAY = {
  day: "2026-10-15",
  today: "2026-10-15",
  technician_id: TECH,
  orders: [
    {
      id: ORDER,
      organization_id: ORG,
      detail_center_id: CENTER,
      folio: "A-01-000123",
      status: "en_proceso",
      scheduled_at: "2026-10-15T15:00:00Z",
      promised_at: null,
      bay: "Bahía 1",
      vehicle: { make: "Mazda", model: "3", year: 2021, plate: "ABC1234" },
      observations: "Cuidado con el alerón",
      items: [
        {
          id: ITEM,
          name: "Lavado",
          quantity: 1,
          status: "en_proceso",
          mine: true,
          started_at: "x",
          finished_at: null,
        },
      ],
      evidence: [
        { id: "e1", kind: "antes", path: `${ORG}/${CENTER}/${ORDER}/${FILE}.jpg`, item_id: ITEM, at: "y" },
      ],
      comments: [{ note: "Rayón", item_id: null, at: "z", by: "Toño" }],
      open_problems: 1,
    },
  ],
  appointments: [
    {
      id: "ap1",
      starts_at: "2026-10-15T20:00:00Z",
      ends_at: "2026-10-15T21:00:00Z",
      bay: null,
      vehicle: { make: "Kia", model: "Rio", year: 2020, plate: "XYZ987" },
      services: ["Aspirado"],
      notes: null,
    },
  ],
};

function fake(rpcData: unknown = DAY, rpcError: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError });
  const createSignedUrls = vi.fn().mockResolvedValue({
    data: [{ path: `${ORG}/${CENTER}/${ORDER}/${FILE}.jpg`, signedUrl: "https://firmada" }],
  });
  const upload = vi.fn().mockResolvedValue({ data: { path: "x" }, error: null });
  const client = {
    rpc,
    storage: { from: vi.fn(() => ({ createSignedUrls, upload })) },
  } as unknown as MeguiarsSupabaseClient;
  return { client, rpc, createSignedUrls, upload };
}

describe("MyWorkRepository (Supabase)", () => {
  it("convierte «Mi día» y firma las fotos", async () => {
    const { client, rpc } = fake();
    const result = await createMyWorkRepository(client).get(CENTER, "2026-10-16");
    expect(rpc).toHaveBeenCalledWith("my_work", { p_detail_center_id: CENTER, p_day: "2026-10-16" });
    if (!result.ok) throw new Error(result.error.message);
    const order = result.data.orders[0]!;
    expect(order.vehicle.plate).toBe("ABC1234");
    expect(order.items[0]).toMatchObject({ name: "Lavado", status: "en_proceso", mine: true });
    expect(order.photos[0]?.url).toBe("https://firmada");
    expect(order.openProblems).toBe(1);
    expect(result.data.appointments[0]?.services).toEqual(["Aspirado"]);
  });

  it("parseMyWork tolera respuestas vacías", () => {
    expect(parseMyWork(null)).toEqual({ day: "", today: "", technicianId: "", orders: [], appointments: [] });
  });

  it("trabajo realizado con nota y resultado de la OS", async () => {
    const { client, rpc } = fake({
      item_status: "terminada",
      order_status: "terminada",
      order_finished: true,
    });
    const result = await createMyWorkRepository(client).done(ITEM, " Listo ");
    expect(rpc).toHaveBeenCalledWith("my_work_done", { p_item_id: ITEM, p_note: "Listo" });
    expect(result).toEqual({
      ok: true,
      data: { itemStatus: "terminada", orderStatus: "terminada", orderFinished: true },
    });
  });

  it("comentario vacío no llega a la base", async () => {
    const { client, rpc } = fake(null);
    const result = await createMyWorkRepository(client).comment(ORDER, "  ");
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect((await createMyWorkRepository(client).comment(ORDER, "Rayón", ITEM)).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("my_work_note", { p_order_id: ORDER, p_note: "Rayón", p_item_id: ITEM });
  });

  it("sube la foto a la ruta de la OS y la registra con la RPC del técnico", async () => {
    const { client, rpc, upload } = fake({ id: "ev1" });
    const result = await createMyWorkRepository(client).uploadPhoto({
      order: { id: ORDER, organizationId: ORG, detailCenterId: CENTER },
      fileId: FILE,
      file: new ArrayBuffer(8),
      contentType: "image/jpeg",
      sizeBytes: 1000,
      kind: "despues",
    });
    expect(upload).toHaveBeenCalledWith(`${ORG}/${CENTER}/${ORDER}/${FILE}.jpg`, expect.anything(), {
      contentType: "image/jpeg",
      upsert: false,
    });
    expect(rpc).toHaveBeenCalledWith("my_work_register_evidence", {
      p_order_id: ORDER,
      p_storage_path: `${ORG}/${CENTER}/${ORDER}/${FILE}.jpg`,
      p_kind: "despues",
      p_content_type: "image/jpeg",
      p_size_bytes: 1000,
    });
    expect(result).toEqual({ ok: true, data: { id: "ev1" } });
  });

  it("desligar un técnico no envía usuario", async () => {
    const { client, rpc } = fake({ id: TECH });
    expect((await createMyWorkRepository(client).linkTechnicianUser(TECH, null, "Ya no trabaja")).ok).toBe(
      true,
    );
    expect(rpc).toHaveBeenCalledWith("link_technician_user", {
      p_technician_id: TECH,
      p_reason: "Ya no trabaja",
    });
    await createMyWorkRepository(client).linkTechnicianUser(TECH, USER, "Alta");
    expect(rpc).toHaveBeenLastCalledWith("link_technician_user", {
      p_technician_id: TECH,
      p_reason: "Alta",
      p_user_id: USER,
    });
  });
});
