import { NextResponse, type NextRequest } from "next/server";
import { parseMetaWebhook, signatureMatches, webhookChallenge } from "@meguiars/domain";
import { createInboxServiceGateway } from "@meguiars/supabase";
import { expectedSignature } from "@/lib/meta";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Webhook oficial de Meta (WhatsApp Cloud API, Messenger e Instagram).
 * - GET: verificación de la suscripción (hub.mode / hub.verify_token / hub.challenge).
 * - POST: sólo se procesa con firma X-Hub-Signature-256 válida (HMAC-SHA256 del
 *   cuerpo crudo con META_APP_SECRET); sin firma o sin secreto responde 401 y
 *   no toca la base. Lo que no se soporta se responde 200 para que Meta no reintente.
 */
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const challenge = webhookChallenge(
    { mode: q.get("hub.mode"), token: q.get("hub.verify_token"), challenge: q.get("hub.challenge") },
    process.env.META_WEBHOOK_VERIFY_TOKEN,
  );
  if (challenge === null) return new NextResponse("Token de verificación inválido", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const expected = expectedSignature(raw);
  if (!expected || !signatureMatches(request.headers.get("x-hub-signature-256"), expected)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }
  const service = createSupabaseServiceClient();
  if (!service) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = parseMetaWebhook(body);
  const gateway = createInboxServiceGateway(service);
  const results: unknown[] = [];
  for (const group of parsed.inbound) {
    const r = await gateway.ingestInbound(group.channel, group.accountId, group.items);
    // Un error de la base sí debe reintentarse: Meta repite el webhook si no recibe 200.
    if (!r.ok) return NextResponse.json({ error: r.error.message }, { status: 500 });
    results.push(r.data);
  }
  for (const group of parsed.statuses) {
    const r = await gateway.ingestStatuses(group.channel, group.items);
    if (!r.ok) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }
  return NextResponse.json({ received: results, skipped: parsed.skipped.length });
}
