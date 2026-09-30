import { activeCenterAccess, COMMERCIAL_COPY, newRequestId, todayIn } from "@meguiars/domain";
import { createCatalogRepository, createCommercialRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewLeadForm } from "@/components/commercial-forms";
import { Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Registrar un prospecto (consulta por redes, WhatsApp, Google, recomendación o mostrador). */
export default async function NewLeadPage() {
  const state = await requireScreen("leadNew");
  const center = activeCenterAccess(state)!.center;
  const supabase = (await createSupabaseServerClient())!;
  const [catalog, owners] = await Promise.all([
    createCatalogRepository(supabase).listForCenter(center.id),
    createCommercialRepository(supabase).leadOwners(center.id),
  ]);
  const ownerList = owners.ok ? owners.data : [];
  return (
    <AppShell state={state} screen="leadNew" title={COMMERCIAL_COPY.newLead} description={center.name}>
      <Link href="/comercial/prospectos" className="text-sm underline">
        ← {COMMERCIAL_COPY.leadsTitle}
      </Link>
      <Card title="Datos de la consulta">
        <NewLeadForm
          requestId={newRequestId()}
          services={(catalog.ok ? catalog.data : []).map((s) => ({ value: s.id, label: s.name }))}
          owners={ownerList}
          defaultOwnerId={ownerList.some((o) => o.userId === state.user.id) ? state.user.id : undefined}
          today={todayIn(center.timezone)}
        />
      </Card>
    </AppShell>
  );
}
