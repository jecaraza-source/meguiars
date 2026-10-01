import { NextResponse, type NextRequest } from "next/server";
import { createMeguiarsClient } from "@meguiars/supabase";
import { sendMessageSchema, sendTemplateSchema } from "@meguiars/validation";
import { sendConversationMessage, sendTemplateMessage } from "@/lib/inbox";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Responder desde la app móvil: los tokens de Meta viven sólo aquí. La app
 * manda su sesión de Supabase (Authorization: Bearer <access_token>); la base
 * valida permisos con esa sesión, igual que en la web.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const env = supabaseEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (!env || !/^Bearer [\w.-]+$/.test(auth))
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const raw: unknown = await request.json().catch(() => null);
  // Con templateId es una plantilla aprobada de WhatsApp; si no, un texto dentro de las 24 h.
  const isTemplate = typeof raw === "object" && raw !== null && "templateId" in raw;
  const parsed = isTemplate ? sendTemplateSchema.safeParse(raw) : sendMessageSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  const client = createMeguiarsClient(env, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: user } = await client.auth.getUser(auth.slice("Bearer ".length));
  if (!user.user) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  const r =
    "templateId" in parsed.data
      ? await sendTemplateMessage(client, parsed.data)
      : await sendConversationMessage(client, parsed.data);
  if (!r.ok) {
    const status =
      r.error.kind === "permission_denied"
        ? 403
        : r.error.kind === "validation"
          ? 400
          : r.error.kind === "conflict"
            ? 409
            : r.error.kind === "unavailable"
              ? 503
              : 422;
    return NextResponse.json({ error: r.error.message, kind: r.error.kind }, { status });
  }
  return NextResponse.json(r.data);
}
