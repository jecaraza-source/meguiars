import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runScheduledAlerts } from "@/lib/alerts-cron";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Evaluación diaria de alertas (vercel.json → crons). Vercel envía
 * `Authorization: Bearer $CRON_SECRET`; sin ese secreto la ruta responde 401
 * y no toca la base.
 */
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const client = createSupabaseServiceClient();
  if (!client) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY o la URL de Supabase" },
      { status: 503 },
    );
  }
  try {
    const summary = await runScheduledAlerts(client);
    return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
