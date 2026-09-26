import { canManageServices, catalogCopy } from "@meguiars/domain";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { NewServiceForm } from "@/components/catalog-forms";
import { Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

export default async function NewServicePage() {
  const state = await requireScreen("catalogNew");
  // Servicios homologados: sólo admin_socio corporativo (RLS lo exige también).
  if (!canManageServices(state)) redirect("/sin-permiso");
  return (
    <AppShell
      state={state}
      screen="catalogNew"
      title={catalogCopy.newTitle}
      description={catalogCopy.newDescription}
    >
      <Card>
        <NewServiceForm />
      </Card>
    </AppShell>
  );
}
