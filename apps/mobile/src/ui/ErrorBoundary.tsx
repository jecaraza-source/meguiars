import { errorCopy, toErrorReport } from "@meguiars/domain";
import { createPilotRepository } from "@meguiars/supabase";
import { Component, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "./controls";
import { EmptyState } from "./display";
import { Screen } from "./layout";

/**
 * Error inesperado al dibujar una pantalla: en lugar de cerrar la app muestra
 * un aviso en español con "Reintentar" (vuelve a montar la navegación; la
 * sesión sigue en SecureStore), deja en el log del dispositivo un reporte
 * sin datos personales y, con sesión, lo registra en client_error_reports
 * (métricas del piloto; la base ignora el centro si no es del usuario).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const report = toErrorReport(error, { source: "mobile" });
    console.error(JSON.stringify(report));
    if (supabase)
      void createPilotRepository(supabase)
        .reportError({ source: "mobile", name: report.name, message: report.message }, null)
        .catch(() => undefined);
  }

  render() {
    if (!this.state.failed)
      return <ChildrenWithKey key={this.state.attempt}>{this.props.children}</ChildrenWithKey>;
    return (
      <Screen title={errorCopy.title} brand>
        <EmptyState title={errorCopy.title} message={errorCopy.message}>
          <Button
            label={errorCopy.retry}
            onPress={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}
          />
        </EmptyState>
      </Screen>
    );
  }
}

function ChildrenWithKey({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
