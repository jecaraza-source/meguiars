import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createInboxRepository, createInboxServiceGateway } from "./inbox";

const U = "11111111-1111-4111-8111-111111111111";

function fakeClient(data: unknown) {
  const rpc = vi.fn(() => Promise.resolve({ data, error: null }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("repositorio de la bandeja", () => {
  it("un mensaje vacío no llega a la base", async () => {
    const { client, rpc } = fakeClient([]);
    const r = await createInboxRepository(client).prepareOutbound(U, U, "   ");
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preparar devuelve lo necesario para enviar con la API oficial", async () => {
    const { client, rpc } = fakeClient([
      {
        message_id: U,
        channel: "whatsapp",
        external_account_id: "1234567890",
        contact_external_id: "5215533334444",
        contact_phone: "+5215533334444",
        body: "Hola",
        already_sent: false,
      },
    ]);
    const r = await createInboxRepository(client).prepareOutbound(U, U, " Hola ");
    expect(rpc).toHaveBeenCalledWith("prepare_outbound_message", {
      p_conversation_id: U,
      p_request_id: U,
      p_body: "Hola",
    });
    expect(r).toEqual({
      ok: true,
      data: {
        messageId: U,
        channel: "whatsapp",
        externalAccountId: "1234567890",
        contactExternalId: "5215533334444",
        contactPhone: "+5215533334444",
        body: "Hola",
        alreadySent: false,
      },
    });
  });

  it("filtros de la bandeja y cuenta sin tokens", async () => {
    const { client, rpc } = fakeClient([]);
    const repo = createInboxRepository(client);
    await repo.conversations([U], { status: "abierta", unassigned: true });
    expect(rpc).toHaveBeenCalledWith("list_conversations", {
      p_detail_center_ids: [U],
      p_status: "abierta",
      p_channel: null,
      p_assigned_to: null,
      p_unassigned: true,
    });
    const bad = await repo.saveAccount({
      organizationId: U,
      detailCenterId: U,
      channel: "whatsapp",
      externalAccountId: "EAAGtokenpegadoporerror",
      label: "WhatsApp",
      active: true,
      reason: "Alta",
    });
    expect(bad.ok).toBe(false);
  });

  it("la pasarela del servidor registra el resultado del envío o la verificación", async () => {
    const { client, rpc } = fakeClient({});
    const gw = createInboxServiceGateway(client);
    await gw.finishOutbound(U, { ok: false, error: "(#131047) Re-engagement message" });
    expect(rpc).toHaveBeenCalledWith("finish_outbound_message", {
      p_message_id: U,
      p_external_id: null,
      p_error: "(#131047) Re-engagement message",
    });
    await gw.recordVerification(U, { ok: true, name: "+52 55 1111 2222" });
    expect(rpc).toHaveBeenCalledWith("record_channel_verification", {
      p_channel_account_id: U,
      p_ok: true,
      p_verified_name: "+52 55 1111 2222",
      p_error: null,
    });
  });
});
