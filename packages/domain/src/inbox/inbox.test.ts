import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { INTEGRATIONS, integrationState } from "../commercial/integrations";
import { replyBlocker, windowOpen, windowRemaining } from "./inbox";
import {
  buildSendRequest,
  buildVerifyRequest,
  parseMetaWebhook,
  parseSendResponse,
  parseVerifyResponse,
  signatureMatches,
  webhookChallenge,
} from "./meta";

describe("webhook de Meta", () => {
  it("WhatsApp: mensajes con nombre y teléfono, tipos sin texto y estados con error", () => {
    const parsed = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5215511112222", phone_number_id: "1234567890" },
                contacts: [{ profile: { name: "Ana Ruiz" }, wa_id: "5215533334444", user_id: "MX.1234" }],
                messages: [
                  {
                    from: "5215533334444",
                    id: "wamid.A",
                    timestamp: "1790790000",
                    type: "text",
                    text: { body: "Hola" },
                  },
                  {
                    from: "5215533334444",
                    id: "wamid.B",
                    timestamp: "1790790060",
                    type: "image",
                    image: { caption: "Mi auto" },
                  },
                  {
                    from: "5215533334444",
                    id: "wamid.C",
                    timestamp: "1790790120",
                    type: "audio",
                    audio: { id: "x" },
                  },
                ],
                statuses: [
                  { id: "wamid.OUT", status: "read", timestamp: "1790790200", recipient_id: "5215533334444" },
                  {
                    id: "wamid.OUT2",
                    status: "failed",
                    timestamp: "1790790300",
                    errors: [{ code: 131047, title: "Re-engagement message" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.inbound).toHaveLength(1);
    expect(parsed.inbound[0]).toMatchObject({ channel: "whatsapp", accountId: "1234567890" });
    expect(parsed.inbound[0]!.items).toEqual([
      expect.objectContaining({
        external_id: "wamid.A",
        contact_id: "5215533334444",
        contact_phone: "5215533334444",
        contact_name: "Ana Ruiz",
        body: "Hola",
        message_type: "text",
        occurred_at: "2026-09-30T17:40:00.000Z",
      }),
      expect.objectContaining({ external_id: "wamid.B", body: "Mi auto", message_type: "image" }),
      expect.objectContaining({ external_id: "wamid.C", body: undefined, message_type: "audio" }),
    ]);
    expect(parsed.statuses[0]!.items).toEqual([
      expect.objectContaining({ external_id: "wamid.OUT", status: "leido" }),
      expect.objectContaining({
        external_id: "wamid.OUT2",
        status: "fallido",
        error: "(#131047) Re-engagement message",
      }),
    ]);
  });

  it("WhatsApp con nombre de usuario: sin teléfono, la conversación usa el BSUID", () => {
    const parsed = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "1234567890" },
                contacts: [{ profile: { name: "Usuario" }, user_id: "MX.99887766" }],
                messages: [
                  {
                    from_user_id: "MX.99887766",
                    id: "wamid.U",
                    timestamp: "1790790000",
                    type: "text",
                    text: { body: "hola" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.inbound[0]!.items[0]).toMatchObject({
      contact_id: "MX.99887766",
      contact_phone: undefined,
      contact_name: "Usuario",
    });
  });

  it("Messenger e Instagram: mensajes, adjuntos, entregas y ecos ignorados", () => {
    const messenger = parseMetaWebhook({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          time: 1790790000000,
          messaging: [
            {
              sender: { id: "PSID1" },
              recipient: { id: "PAGE1" },
              timestamp: 1790790000000,
              message: { mid: "m_1", text: "¿Precio?" },
            },
            {
              sender: { id: "PSID1" },
              recipient: { id: "PAGE1" },
              timestamp: 1790790001000,
              message: { mid: "m_2", attachments: [{ type: "image" }] },
            },
            {
              sender: { id: "PAGE1" },
              recipient: { id: "PSID1" },
              timestamp: 1790790002000,
              message: { mid: "m_3", text: "eco", is_echo: true },
            },
            {
              sender: { id: "PSID1" },
              recipient: { id: "PAGE1" },
              timestamp: 1790790003000,
              delivery: { mids: ["m_out"] },
            },
          ],
        },
      ],
    });
    expect(messenger.inbound[0]).toMatchObject({ channel: "messenger", accountId: "PAGE1" });
    expect(messenger.inbound[0]!.items.map((i) => [i.external_id, i.message_type, i.body])).toEqual([
      ["m_1", "text", "¿Precio?"],
      ["m_2", "image", undefined],
    ]);
    expect(messenger.statuses[0]!.items).toEqual([
      expect.objectContaining({ external_id: "m_out", status: "entregado" }),
    ]);

    const ig = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          id: "178414",
          messaging: [
            {
              sender: { id: "IGSID" },
              recipient: { id: "178414" },
              timestamp: 1790790000000,
              message: { mid: "ig_1", text: "Hola" },
            },
          ],
        },
      ],
    });
    expect(ig.inbound[0]).toMatchObject({
      channel: "instagram",
      accountId: "178414",
      items: [expect.objectContaining({ contact_id: "IGSID" })],
    });
  });

  it("objetos y campos no soportados se omiten sin fallar", () => {
    expect(parseMetaWebhook({ object: "user", entry: [{}] }).skipped).toEqual(["objeto user"]);
    expect(parseMetaWebhook("x").skipped).toEqual(["cuerpo inválido"]);
    const p = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "account_update", value: {} }] }],
    });
    expect(p.inbound).toEqual([]);
    expect(p.skipped).toEqual(["whatsapp:account_update"]);
  });

  it("verificación del webhook: sólo con el token configurado", () => {
    const ok = { mode: "subscribe", token: "t0k3n", challenge: "12345" };
    expect(webhookChallenge(ok, "t0k3n")).toBe("12345");
    expect(webhookChallenge({ ...ok, token: "otro" }, "t0k3n")).toBeNull();
    expect(webhookChallenge(ok, undefined)).toBeNull();
    expect(webhookChallenge({ ...ok, mode: "unsubscribe" }, "t0k3n")).toBeNull();
  });

  it("firma X-Hub-Signature-256: HMAC-SHA256 del cuerpo crudo con el App Secret", () => {
    const body = '{"object":"page","entry":[]}';
    const hex = createHmac("sha256", "app-secret").update(body).digest("hex");
    expect(signatureMatches(`sha256=${hex}`, hex)).toBe(true);
    const other = createHmac("sha256", "otro").update(body).digest("hex");
    expect(signatureMatches(`sha256=${other}`, hex)).toBe(false);
    expect(signatureMatches(hex, hex)).toBe(false);
    expect(signatureMatches(null, hex)).toBe(false);
    expect(signatureMatches("sha256=abc", hex)).toBe(false);
  });
});

describe("envío y verificación con la Graph API", () => {
  const base = { externalAccountId: "1234567890", contactExternalId: "5215533334444", body: "Hola" };
  it("WhatsApp al teléfono o, sin teléfono, al BSUID con recipient", () => {
    expect(buildSendRequest({ ...base, channel: "whatsapp", contactPhone: "+5215533334444" })).toEqual({
      url: "https://graph.facebook.com/v26.0/1234567890/messages",
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "5215533334444",
        type: "text",
        text: { preview_url: false, body: "Hola" },
      },
    });
    expect(
      buildSendRequest({ ...base, channel: "whatsapp", contactExternalId: "MX.1", contactPhone: null }).body,
    ).toMatchObject({ recipient: "MX.1" });
  });
  it("Messenger con messaging_type RESPONSE; Instagram en graph.instagram.com", () => {
    expect(
      buildSendRequest({ ...base, channel: "messenger", contactExternalId: "PSID", contactPhone: null }),
    ).toEqual({
      url: "https://graph.facebook.com/v26.0/1234567890/messages",
      method: "POST",
      body: { recipient: { id: "PSID" }, messaging_type: "RESPONSE", message: { text: "Hola" } },
    });
    const ig = buildSendRequest(
      { ...base, channel: "instagram", contactExternalId: "IGSID", contactPhone: null },
      { graph: "http://x" },
    );
    expect(ig.url).toBe("https://graph.instagram.com/v26.0/1234567890/messages");
    expect(ig.body).toEqual({ recipient: { id: "IGSID" }, message: { text: "Hola" } });
  });
  it("respuestas: id de Meta o error legible", () => {
    expect(parseSendResponse(200, { messaging_product: "whatsapp", messages: [{ id: "wamid.X" }] })).toEqual({
      ok: true,
      externalId: "wamid.X",
    });
    expect(parseSendResponse(200, { recipient_id: "PSID", message_id: "m_X" })).toEqual({
      ok: true,
      externalId: "m_X",
    });
    expect(parseSendResponse(400, { error: { message: "Invalid OAuth access token", code: 190 } })).toEqual({
      ok: false,
      error: "(#190) Invalid OAuth access token",
    });
    expect(parseSendResponse(502, null)).toEqual({ ok: false, error: "Meta respondió HTTP 502" });
  });
  it("verificar cuenta: número, página o que el token sea de la cuenta de Instagram registrada", () => {
    expect(buildVerifyRequest("whatsapp", "1234567890").url).toBe(
      "https://graph.facebook.com/v26.0/1234567890?fields=display_phone_number,verified_name",
    );
    expect(buildVerifyRequest("instagram", "178414").url).toBe(
      "https://graph.instagram.com/v26.0/me?fields=user_id,username",
    );
    expect(
      parseVerifyResponse("whatsapp", "1", 200, {
        display_phone_number: "+52 55 1111 2222",
        verified_name: "Meguiar's",
      }),
    ).toEqual({ ok: true, name: "+52 55 1111 2222 · Meguiar's" });
    expect(parseVerifyResponse("messenger", "1", 200, { name: "Meguiar's Detail" })).toEqual({
      ok: true,
      name: "Meguiar's Detail",
    });
    expect(
      parseVerifyResponse("instagram", "178414", 200, { user_id: "178414", username: "meguiars" }),
    ).toEqual({ ok: true, name: "@meguiars" });
    expect(parseVerifyResponse("instagram", "178414", 200, { user_id: "999", username: "otra" }).ok).toBe(
      false,
    );
    expect(
      parseVerifyResponse("whatsapp", "1", 401, {
        error: { message: "Error validating access token", code: 190 },
      }),
    ).toEqual({ ok: false, error: "(#190) Error validating access token" });
  });
});

describe("ventana de atención e integraciones", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  it("24 h desde el último mensaje del contacto", () => {
    expect(windowOpen("2026-09-29T12:30:00Z", now)).toBe(true);
    expect(windowOpen("2026-09-29T11:59:00Z", now)).toBe(false);
    expect(windowOpen(null, now)).toBe(false);
    expect(windowRemaining("2026-09-30T10:00:00Z", now)).toEqual({ hours: 22, minutes: 0 });
    expect(replyBlocker({ windowOpen: true, accountStatus: "pendiente" })).toMatch(/no está verificada/);
    expect(replyBlocker({ windowOpen: false, accountStatus: "verificada" })).toMatch(/24 h/);
    expect(replyBlocker({ windowOpen: true, accountStatus: "verificada" })).toBeNull();
  });
  it("«Conectada» sólo con una cuenta activa verificada por el servidor", () => {
    const wa = INTEGRATIONS.find((i) => i.channel === "whatsapp_business")!;
    const acc = { channel: "whatsapp" as const, active: true, lastVerifyError: null, label: "WhatsApp CDMX" };
    expect(integrationState(wa, []).status).toBe("pendiente_configurar");
    expect(integrationState(wa, [{ ...acc, status: "pendiente" }]).detail).toMatch(/probar la conexión/);
    expect(
      integrationState(wa, [{ ...acc, status: "error", lastVerifyError: "(#190) token" }]).detail,
    ).toMatch(/#190/);
    expect(integrationState(wa, [{ ...acc, status: "verificada" }]).status).toBe("conectada");
    expect(integrationState(wa, [{ ...acc, status: "verificada", active: false }]).status).toBe(
      "pendiente_configurar",
    );
    expect(integrationState(wa, [{ ...acc, status: "verificada" }], false).detail).toMatch(/credenciales/);
    const tiktok = INTEGRATIONS.find((i) => i.channel === "tiktok")!;
    expect(integrationState(tiktok, [{ ...acc, status: "verificada" }]).status).toBe("no_disponible");
    expect(INTEGRATIONS.every((i) => i.status !== "conectada")).toBe(true);
  });
});
