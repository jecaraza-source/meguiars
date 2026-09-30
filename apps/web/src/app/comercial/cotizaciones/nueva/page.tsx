import { activeCenterAccess, COMMERCIAL_COPY, newRequestId, usableCenters } from "@meguiars/domain";
import {
  createCatalogRepository,
  createClientRepository,
  createCommercialRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewQuoteForm } from "@/components/commercial-forms";
import { Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Nueva cotización para un prospecto (?prospecto=) o un cliente (?cliente=). */
export default async function NewQuotePage({ searchParams }: PageProps<"/comercial/cotizaciones/nueva">) {
  const state = await requireScreen("quoteNew");
  const center = activeCenterAccess(state)!.center;
  const query = await searchParams;
  const leadId = typeof query.prospecto === "string" ? query.prospecto : undefined;
  const clientParam = typeof query.cliente === "string" ? query.cliente : undefined;
  const supabase = (await createSupabaseServerClient())!;
  const lead = leadId
    ? await createCommercialRepository(supabase).lead(
        leadId,
        usableCenters(state.access).map((a) => a.center.id),
      )
    : null;
  const clientId = clientParam ?? (lead?.ok ? (lead.data.clientId ?? undefined) : undefined);
  const [catalog, client] = await Promise.all([
    createCatalogRepository(supabase).listForCenter(center.id),
    clientId ? createClientRepository(supabase).get(clientId) : Promise.resolve(null),
  ]);
  const back = leadId
    ? `/comercial/prospectos/${leadId}`
    : clientId
      ? `/comercial/clientes/${clientId}`
      : "/comercial/cotizaciones";
  const target = (lead && lead.ok) || (client && client.ok);
  return (
    <AppShell state={state} screen="quoteNew" title={COMMERCIAL_COPY.newQuote} description={center.name}>
      <Link href={back} className="text-sm underline">
        ← Volver
      </Link>
      {!target ? (
        <EmptyState
          title="Elige a quién cotizar"
          message="Abre la cotización desde un prospecto o desde la ficha de un cliente."
        />
      ) : lead?.ok && lead.data.detailCenterId !== center.id ? (
        <EmptyState title="Otro centro" message="Cambia al centro del prospecto para cotizarle." />
      ) : (
        <Card title="Servicios y condiciones">
          <NewQuoteForm
            requestId={newRequestId()}
            catalog={catalog.ok ? catalog.data : []}
            lead={
              lead?.ok
                ? {
                    id: lead.data.id,
                    name: lead.data.fullName,
                    interestServiceIds: lead.data.interestServiceIds,
                  }
                : null
            }
            client={client?.ok ? { id: client.data.id, name: client.data.fullName } : null}
            vehicles={(client?.ok ? client.data.vehicles : [])
              .filter((v) => v.active)
              .map((v) => ({ value: v.id, label: `${v.make} ${v.model} ${v.year} · ${v.plate}` }))}
          />
        </Card>
      )}
    </AppShell>
  );
}
