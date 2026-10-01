import type { MeguiarsSupabaseClient } from "@meguiars/supabase";

/**
 * URL pública de la web (p. ej. https://meguiars-web.vercel.app). La app no
 * tiene tokens de Meta: para responder llama a /api/inbox/send con su sesión
 * de Supabase y el servidor envía con la API oficial.
 */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "").replace(/\/$/, "");

export type SendResult =
  { ok: true; status: "enviado" | "fallido"; error?: string } | { ok: false; error: string };

/** Texto dentro de las 24 h (con el último mensaje visto) o plantilla aprobada de WhatsApp. */
export type SendInput =
  | { conversationId: string; requestId: string; body: string; expectedLastMessageAt?: string }
  | { conversationId: string; requestId: string; templateId: string; params: string[] };

export async function sendFromApp(client: MeguiarsSupabaseClient, input: SendInput): Promise<SendResult> {
  if (!WEB_URL)
    return { ok: false, error: "La app no tiene configurada la URL del servidor (EXPO_PUBLIC_WEB_URL)." };
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Tu sesión expiró; vuelve a iniciar sesión." };
  try {
    const res = await fetch(`${WEB_URL}/api/inbox/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; status?: "enviado" | "fallido" };
    if (!res.ok) return { ok: false, error: json.error ?? `El servidor respondió ${res.status}` };
    return { ok: true, status: json.status ?? "enviado", ...(json.error ? { error: json.error } : {}) };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor; intenta de nuevo." };
  }
}
