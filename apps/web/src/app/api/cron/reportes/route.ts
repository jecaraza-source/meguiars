import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { emailConfigStatus } from "@/lib/email";
import { runScheduledReports } from "@/lib/report-emails";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Reportes de Dirección por correo (vercel.json → crons, diario por la mañana).
 * Vercel envía `Authorization: Bearer $CRON_SECRET`; sin ese secreto responde
 * 401 y no toca la base. Cada programación manda su último periodo cerrado si
 * aún no se envió (diario, semanal, quincenal o mensual).
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const email = emailConfigStatus();
  if (!email.ready) {
    return NextResponse.json({ error: `Falta configurar ${email.missing.join(" y ")}` }, { status: 503 });
  }
  const client = createSupabaseServiceClient();
  if (!client) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY o la URL de Supabase" },
      { status: 503 },
    );
  }
  try {
    const summary = await runScheduledReports(client);
    return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
