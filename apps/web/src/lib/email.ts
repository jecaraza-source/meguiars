import "server-only";

/**
 * Envío de correo con la API oficial de Resend (ADR 0041). Sólo reportes
 * internos de Dirección; nunca correos a clientes. Variables SÓLO del
 * servidor (Vercel → Environment Variables, nunca NEXT_PUBLIC_):
 *
 * - RESEND_API_KEY: llave de la API (permiso «Sending access»).
 * - REPORTS_EMAIL_FROM: remitente de un dominio verificado en Resend, p. ej.
 *   «Meguiar's Reportes <reportes@tudominio.mx>».
 *
 * Sin ellas no se envía nada y las pantallas lo dicen (no se simula el envío).
 */

const RESEND_URL = "https://api.resend.com/emails";
const present = (name: string) => (process.env[name] ?? "").trim() !== "";

export function emailConfigStatus() {
  const missing = ["RESEND_API_KEY", "REPORTS_EMAIL_FROM"].filter((n) => !present(n));
  return { ready: missing.length === 0, missing };
}

export interface OutboundEmail {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Evita duplicados si el mismo envío se reintenta (24 h en Resend). */
  idempotencyKey?: string;
}

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(email: OutboundEmail): Promise<EmailResult> {
  const status = emailConfigStatus();
  if (!status.ready) return { ok: false, error: `Falta configurar ${status.missing.join(" y ")}` };
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.REPORTS_EMAIL_FROM!.trim(),
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: unknown; message?: unknown; name?: unknown };
    if (!res.ok || typeof body.id !== "string") {
      const detail = typeof body.message === "string" ? body.message : `HTTP ${res.status}`;
      return { ok: false, error: `Resend: ${detail}` };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: `Resend: ${e instanceof Error ? e.message : String(e)}` };
  }
}
