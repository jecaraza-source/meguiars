"use client";

import { errorCopy, toErrorReport } from "@meguiars/domain";
import { useEffect } from "react";
import { reportClientErrorAction } from "@/app/actions/pilot";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

/**
 * Error inesperado en una pantalla: mensaje en español, sin detalle técnico
 * (en producción Next sólo envía el `digest`, que se cruza con los logs de
 * instrumentation.ts) y opción de reintentar sin perder la sesión. También lo
 * registra (sin datos personales) en client_error_reports para las métricas del piloto.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    const r = toErrorReport(error, { source: "web", path: window.location.pathname });
    void reportClientErrorAction({
      name: r.name,
      message: r.message,
      ...(r.digest ? { digest: r.digest } : {}),
      ...(r.path ? { route: r.path } : {}),
    }).catch(() => undefined);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center p-lg">
      <EmptyState
        title={errorCopy.title}
        message={
          error.digest ? `${errorCopy.message} ${errorCopy.reference(error.digest)}` : errorCopy.message
        }
        action={
          <div className="flex flex-wrap justify-center gap-sm">
            <Button label={errorCopy.retry} onClick={() => retry()} />
            <ButtonLink href="/" label={errorCopy.home} variant="secondary" />
          </div>
        }
      />
    </main>
  );
}
