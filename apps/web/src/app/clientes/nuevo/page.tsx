import { clientsCopy } from "@meguiars/domain";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/app-shell";
import { NewClientForm } from "@/components/client-forms";
import { Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

export default async function NewClientPage() {
  const state = await requireScreen("clientNew");
  return (
    <AppShell
      state={state}
      screen="clientNew"
      title={clientsCopy.newTitle}
      description={clientsCopy.newDescription}
    >
      <Card>
        {/* Llave de idempotencia de este formulario (se conserva en reintentos). */}
        <NewClientForm requestId={randomUUID()} />
      </Card>
    </AppShell>
  );
}
