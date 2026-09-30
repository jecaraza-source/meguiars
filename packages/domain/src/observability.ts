/**
 * Reporte de error apto para logs (web: instrumentation.ts; móvil: ErrorBoundary).
 * Nunca incluye datos personales: se enmascaran correos, teléfonos (7+ dígitos),
 * tokens JWT y llaves; la ruta pierde la query (búsquedas por nombre o teléfono)
 * y el mensaje se recorta. Los identificadores (uuid, digest, x-vercel-id) se
 * conservan para cruzar el error con la petición.
 */
export type ErrorReport = {
  level: "error";
  source: "web" | "mobile";
  name: string;
  message: string;
  digest?: string;
  path?: string;
  method?: string;
  route?: string;
  kind?: string;
  requestId?: string;
};

const MAX_MESSAGE = 300;

export function redactPii(text: string): string {
  return (
    text
      .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, "[token]")
      .replace(/\b(?:sb_(?:secret|publishable)|sbp|gh[pousr])_[\w-]{10,}/g, "[llave]")
      // Tokens de acceso de Meta (WhatsApp/Messenger: EAA…, Instagram: IGAA…).
      .replace(/\b(?:EAA|IGAA)[A-Za-z0-9]{20,}/g, "[token]")
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[correo]")
      .replace(/(?<![\w-])\+?\d[\d\s().-]{5,}\d(?![\w-])/g, (m) =>
        m.replace(/\D/g, "").length >= 7 ? "[teléfono]" : m,
      )
  );
}

export function toErrorReport(
  error: unknown,
  context: {
    source: ErrorReport["source"];
    path?: string;
    method?: string;
    route?: string;
    kind?: string;
    requestId?: string;
  },
): ErrorReport {
  const err = error instanceof Error ? error : null;
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : undefined;
  const raw = err?.message ?? (typeof error === "string" ? error : "Error sin mensaje");
  const message = redactPii(raw);
  return {
    level: "error",
    source: context.source,
    name: err?.name ?? typeof error,
    message: message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message,
    ...(digest ? { digest } : {}),
    ...(context.path ? { path: context.path.split("?")[0] } : {}),
    ...(context.method ? { method: context.method } : {}),
    ...(context.route ? { route: context.route } : {}),
    ...(context.kind ? { kind: context.kind } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
  };
}
