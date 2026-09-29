import { errorCopy, toErrorReport } from "@meguiars/domain";
import { Component, type ReactNode } from "react";
import { Button } from "./controls";
import { EmptyState } from "./display";
import { Screen } from "./layout";

/**
 * Error inesperado al dibujar una pantalla: en lugar de cerrar la app muestra
 * un aviso en español con "Reintentar" (vuelve a montar la navegación; la
 * sesión sigue en SecureStore) y deja en el log del dispositivo un reporte
 * sin datos personales.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(JSON.stringify(toErrorReport(error, { source: "mobile" })));
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
