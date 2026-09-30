import { clientsCopy, usableCenters } from "@meguiars/domain";
import { createCommercialRepository } from "@meguiars/supabase";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/app-shell";
import { NewClientForm } from "@/components/client-forms";
import { Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewClientPage({ searchParams }: PageProps<"/clientes/nuevo">) {
  const state = await requireScreen("clientNew");
  const query = await searchParams;
  const leadId = typeof query.prospecto === "string" ? query.prospecto : undefined;
  // Alta desde un prospecto: se precargan sus datos y queda ligado al terminar.
  const lead = leadId
    ? await createCommercialRepository((await createSupabaseServerClient())!).lead(
        leadId,
        usableCenters(state.access).map((a) => a.center.id),
      )
    : null;
  const initial = lead?.ok
    ? { fullName: lead.data.fullName, phone: lead.data.phone ?? "", email: lead.data.email ?? "" }
    : undefined;
  return (
    <AppShell
      state={state}
      screen="clientNew"
      title={clientsCopy.newTitle}
      description={clientsCopy.newDescription}
    >
      <Card>
        {/* Llave de idempotencia de este formulario (se conserva en reintentos). */}
        <NewClientForm
          requestId={randomUUID()}
          leadId={lead?.ok ? lead.data.id : undefined}
          initial={initial}
        />
      </Card>
    </AppShell>
  );
}
