import { PILOT_COPY } from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { ImportForm } from "@/components/pilot-forms";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { centersScope } from "@/lib/pilot";

/**
 * Importador de datos maestros (sólo web: es trabajo de escritorio con archivos).
 * Valida con las reglas de los formularios, muestra la vista previa y aplica con las RPC.
 */
export default async function CenterImportPage({ params }: PageProps<"/equipo/centros/[id]/importar">) {
  const state = await requireScreen("centerImport");
  const { id } = await params;
  const scope = centersScope(state);
  const center = scope.centers.find((c) => c.id === id);
  return (
    <AppShell
      state={state}
      screen="centerImport"
      title={center ? `${PILOT_COPY.importer}: ${center.name}` : PILOT_COPY.importer}
      description="Carga catálogo, bahías, técnicos, categorías y planes desde CSV (Excel o Google Sheets). Nada se escribe hasta que aplicas la vista previa sin errores."
    >
      {center ? (
        <>
          <ButtonLink href={`/equipo/centros/${center.id}`} label="Volver al checklist" />
          <ImportForm centerId={center.id} isActive={center.id === scope.activeCenterId} />
        </>
      ) : (
        <EmptyState title="Centro inexistente o sin permiso" />
      )}
    </AppShell>
  );
}
