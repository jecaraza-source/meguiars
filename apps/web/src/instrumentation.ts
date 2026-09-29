import type { Instrumentation } from "next";
import { toErrorReport } from "@meguiars/domain";

/**
 * Errores del servidor (render, server actions, rutas) a los logs de Vercel en
 * una línea JSON sin datos personales (ver @meguiars/domain/observability).
 * `digest` es la referencia que ve el usuario en la pantalla de error y
 * `requestId` (x-vercel-id) cruza con los logs de la petición.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const header = request.headers["x-vercel-id"] ?? request.headers["x-request-id"];
  const report = toErrorReport(error, {
    source: "web",
    path: request.path,
    method: request.method,
    route: context.routePath,
    kind: context.routeType,
    requestId: Array.isArray(header) ? header[0] : header,
  });
  console.error(JSON.stringify(report));
};
