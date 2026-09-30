import { NextResponse, type NextRequest } from "next/server";
import { createMeguiarsClient } from "@meguiars/supabase";
import { sendMessageSchema } from "@meguiars/validation";
import { sendConversationMessage } from "@/lib/inbox";
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
  const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
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
  const r = await sendConversationMessage(client, parsed.data);
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
