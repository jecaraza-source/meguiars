import type { MeguiarsSupabaseClient } from "@meguiars/supabase";
import { WEB_URL } from "./inbox";

/**
 * Pide el reporte comercial con IA (ADR 0051). La llave de la IA vive sólo en
 * el servidor: la app llama a /api/comercial/reporte-ia con su sesión.
 */
export async function requestCommercialAiReport(
  client: MeguiarsSupabaseClient,
  input: { detailCenterId: string; periodId: string; scope: "centro" | "todos"; requestId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!WEB_URL)
    return { ok: false, error: "La app no tiene configurada la URL del servidor (EXPO_PUBLIC_WEB_URL)." };
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Tu sesión expiró; vuelve a iniciar sesión." };
  try {
    const res = await fetch(`${WEB_URL}/api/comercial/reporte-ia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: json.error ?? `El servidor respondió ${res.status}` };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor; intenta de nuevo." };
  }
}
