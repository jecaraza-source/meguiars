import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createClientRepository } from "./clients";

const CENTER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "10000000-0000-4000-8000-000000000001";
const CLIENT_ROW = {
  id: "c1000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-00000000d3e0",
  home_detail_center_id: CENTER,
  kind: "person",
  full_name: "José Pérez",
  phone: "+525512345678",
  email: "jose@correo.mx",
  notes: null,
  marketing_opt_in: true,
  marketing_channels: ["whatsapp"],
  marketing_opt_in_at: "2026-09-25T10:00:00Z",
  marketing_opt_in_source: "web",
  last_visit_at: null,
  last_visit_detail_center_id: null,
  active: true,
  request_id: REQUEST,
  created_in_detail_center_id: CENTER,
  created_by: null,
  search_name: "jose perez",
  phone_digits: "525512345678",
  created_at: "2026-09-25T10:00:00Z",
  updated_at: "2026-09-25T10:00:00Z",
};

function fakeRpc(response: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => Object.assign(Promise.resolve(response), { single }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const command = {
  detailCenterId: CENTER,
  requestId: REQUEST,
  fullName: " José  Pérez ",
  phone: "55 1234 5678",
  email: "Jose@Correo.MX",
  kind: "person" as const,
  marketingChannels: ["whatsapp" as const],
  source: "mobile" as const,
  vehicles: [{ make: "Mazda", model: "3", year: 2021, plate: "abc-12-34" }],
};

describe("ClientRepository (Supabase)", () => {
  it("alta: envía datos normalizados a create_client y mapea el cliente", async () => {
    const { client, rpc } = fakeRpc({ data: CLIENT_ROW, error: null });
    const result = await createClientRepository(client).create(command);
    expect(rpc).toHaveBeenCalledWith("create_client", {
      p_detail_center_id: CENTER,
      p_request_id: REQUEST,
      p_full_name: "José Pérez",
      p_phone: "+525512345678",
      p_email: "jose@correo.mx",
      p_kind: "person",
      p_marketing_channels: ["whatsapp"],
      p_source: "mobile",
      p_vehicles: [
        { make: "Mazda", model: "3", year: 2021, plate: "ABC1234", identifier: null, notes: null },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      data: { fullName: "José Pérez", marketing: { optIn: true, channels: ["whatsapp"], source: "web" } },
    });
  });

  it("valida antes de llamar al backend", async () => {
    const { client, rpc } = fakeRpc({ data: null, error: null });
    const result = await createClientRepository(client).create({ ...command, phone: "123" });
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { kind: "validation" } });
  });

  it("un posible duplicado llega como conflicto con código MG001", async () => {
    const { client } = fakeRpc({
      data: null,
      error: { code: "MG001", message: "Posible cliente duplicado" },
    });
    const result = await createClientRepository(client).create(command);
    expect(result).toEqual({
      ok: false,
      error: { kind: "conflict", code: "MG001", message: "Posible cliente duplicado" },
    });
  });

  it("búsqueda: exige 2 caracteres y mapea resultados", async () => {
    const row = {
      id: CLIENT_ROW.id,
      full_name: "José Pérez",
      phone: "+525512345678",
      email: null,
      kind: "person",
      home_detail_center_id: CENTER,
      home_center_name: "Centro CDMX",
      last_visit_at: null,
      in_active_center: true,
      plates: ["ABC1234"],
      matched_on: "plate",
    };
    const { client, rpc } = fakeRpc({ data: [row], error: null });
    const repo = createClientRepository(client);
    expect(await repo.search(CENTER, "a")).toMatchObject({ ok: false, error: { kind: "validation" } });
    const result = await repo.search(CENTER, " abc ");
    expect(rpc).toHaveBeenCalledWith("search_clients", { p_detail_center_id: CENTER, p_query: "abc" });
    expect(result).toMatchObject({
      ok: true,
      data: [{ plates: ["ABC1234"], matchedOn: "plate", inActiveCenter: true }],
    });
  });

  it("duplicados: mapea coincidencias enmascaradas", async () => {
    const { client } = fakeRpc({
      data: [
        {
          client_id: CLIENT_ROW.id,
          display_name: "José P.",
          phone_hint: "•••• 5678",
          home_center_name: "Centro CDMX",
          matched_on: ["phone"],
          visible: false,
        },
      ],
      error: null,
    });
    const result = await createClientRepository(client).findMatches({
      detailCenterId: CENTER,
      phone: "5512345678",
    });
    expect(result).toEqual({
      ok: true,
      data: [
        {
          clientId: CLIENT_ROW.id,
          displayName: "José P.",
          phoneHint: "•••• 5678",
          homeCenterName: "Centro CDMX",
          matchedOn: ["phone"],
          visible: false,
        },
      ],
    });
  });
});
