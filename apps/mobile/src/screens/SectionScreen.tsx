import { sectionCopy } from "@meguiars/domain";
import { Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

/** Pantalla de dominio: estructura y navegación listas; el contenido llega con su módulo. */
export function SectionScreen({
  section,
  header,
  subnav,
}: PrivateScreenProps & { section: "operacion" | "comercial" | "finanzas" }) {
  const copy = sectionCopy[section];
  return (
    <Screen title={copy.title} description={copy.description} header={header}>
      {subnav}
      <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} />
      <Card title="Vista previa del diseño" subtitle="Así se verá la carga de datos en esta sección.">
        <Skeleton lines={4} label="Vista previa de carga" />
      </Card>
    </Screen>
  );
}
