import { runReminders } from "@meguiars/domain";
import { createMembershipReminderServiceGateway, createReminderServiceGateway } from "@meguiars/supabase";
import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { channelServerReady, sendReminderViaMeta } from "@/lib/meta";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Recordatorios de cita por WhatsApp. Lo llama cada hora pg_cron (pg_net) desde
 * Supabase con `Authorization: Bearer $CRON_SECRET`; sin ese secreto responde
 * 401 y no toca la base. La base decide qué citas tocan y prepara cada mensaje;
 * aquí sólo se envía con el token de Meta del servidor. Además de los
 * recordatorios de cita, envía los avisos de membresía sin usar (ADR 0049).
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const service = createSupabaseServiceClient();
  if (!service) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY o la URL de Supabase" },
      { status: 503 },
    );
  }
  if (!channelServerReady("whatsapp")) {
    return NextResponse.json({ error: "WhatsApp no está configurado en el servidor" }, { status: 503 });
  }
  try {
    const sender = { send: sendReminderViaMeta };
    const run = await runReminders({ gateway: createReminderServiceGateway(service), sender });
    const memberships = await runReminders({
      gateway: createMembershipReminderServiceGateway(service),
      sender,
    });
    const errors = [...run.errors, ...memberships.errors];
    return NextResponse.json({ ...run, memberships }, { status: errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
