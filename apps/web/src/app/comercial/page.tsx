import { sectionCopy } from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, Skeleton } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

// Pantalla del dominio: la estructura y la navegación existen; el contenido llega con su módulo.
export default async function Page() {
  const state = await requireScreen("comercial");
  const copy = sectionCopy.comercial;
  return (
    <AppShell state={state} screen="comercial" title={copy.title} description={copy.description}>
      <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} />
      <Card title="Vista previa del diseño" subtitle="Así se verá la carga de datos en esta sección.">
        <Skeleton lines={4} label="Vista previa de carga" />
      </Card>
    </AppShell>
  );
}
