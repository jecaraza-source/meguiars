import { activeCenterAccess, authCopy } from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { EditCenterForm } from "@/components/forms";
import { Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

/** Configuración → Datos del centro: nombre y zona horaria del centro activo (admin). */
export default async function CenterSettingsPage() {
  const state = await requireScreen("editCenter");
  const active = activeCenterAccess(state)!;
  return (
    <AppShell state={state} screen="editCenter" title="Datos del centro" description={active.center.name}>
      {/* La UI oculta lo que el rol no permite; RLS lo bloquea de todos modos. */}
      <Card
        title={authCopy.editCenterTitle}
        subtitle="Los cambios quedan en la bitácora de auditoría con su motivo."
      >
        <EditCenterForm key={active.center.id} name={active.center.name} timezone={active.center.timezone} />
      </Card>
    </AppShell>
  );
}
