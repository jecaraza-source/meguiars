import { activeCenterAccess, canInActiveCenter } from "@meguiars/domain";
import { createInboxRepository } from "@meguiars/supabase";
import { getAuthState } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Mensajes sin leer de la bandeja del centro activo, para el punto rojo del
 * menú. Usa la sesión del usuario (cookies): sin sesión 401; sin acceso a la
 * bandeja, 0. No devuelve nombres ni textos, sólo el número.
 */
export async function GET() {
  const state = await getAuthState();
  if (state.status !== "signed_in") return Response.json({ unread: 0 }, { status: 401 });
  const center = activeCenterAccess(state)?.center;
  if (!center || !canInActiveCenter(state, "commercial.workspace.read")) return Response.json({ unread: 0 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return Response.json({ unread: 0 }, { status: 503 });
  const r = await createInboxRepository(supabase).unreadCount(center.id);
  return Response.json(
    { unread: r.ok ? r.data : 0 },
    { status: r.ok ? 200 : 502, headers: { "cache-control": "no-store" } },
  );
}
