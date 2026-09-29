"use client";

import { errorCopy } from "@meguiars/domain";
import { toComponentCss, toCssVariables } from "@meguiars/ui-tokens";
import "./globals.css";

/**
 * Error en el layout raíz: reemplaza todo el documento (por eso trae su html,
 * body y estilos). Mismo mensaje que error.tsx, sin detalle técnico.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es-MX">
      <head>
        <title>{errorCopy.title}</title>
        <style>{toCssVariables() + toComponentCss()}</style>
      </head>
      <body className="flex min-h-dvh flex-col items-center justify-center gap-sm p-lg text-center">
        <p className="text-lg font-semibold">{errorCopy.title}</p>
        <p className="max-w-(--mg-layout-narrow) text-sm text-muted">
          {errorCopy.message}
          {error.digest ? ` ${errorCopy.reference(error.digest)}` : ""}
        </p>
        <button
          type="button"
          className="mg-btn"
          data-variant="primary"
          data-size="md"
          onClick={() => retry()}
        >
          {errorCopy.retry}
        </button>
      </body>
    </html>
  );
}
