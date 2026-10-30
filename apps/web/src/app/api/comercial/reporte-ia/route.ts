import { NextResponse, type NextRequest } from "next/server";
import { createMeguiarsClient, loadAuthState } from "@meguiars/supabase";
import { generateCommercialAiReport } from "@/lib/commercial-ai";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Reporte comercial con IA desde la app móvil (ADR 0051): la llave de la IA
 * vive sólo aquí. La app manda su sesión de Supabase (Bearer); permisos,
 * periodo y cifras se resuelven con esa sesión, igual que en la web.
 */
export const maxDuration = 120;

const STATUS = { validation: 400, permission_denied: 403, conflict: 409, unavailable: 503 } as const;

export async function POST(request: NextRequest) {
  const env = supabaseEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (!env || !/^Bearer [\w.-]+$/.test(auth))
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const client = createMeguiarsClient(env, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: auth } },
  });
  const state = await loadAuthState(client, null, auth.slice("Bearer ".length));
  if (!state.ok || state.data.status !== "signed_in")
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  const raw: unknown = await request.json().catch(() => null);
  const r = await generateCommercialAiReport(client, state.data, raw);
  if (!r.ok)
    return NextResponse.json(
      { error: r.error.message },
      { status: STATUS[r.error.kind as keyof typeof STATUS] ?? 500 },
    );
  return NextResponse.json({ id: r.data.id });
}
