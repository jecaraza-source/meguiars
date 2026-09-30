import {
  COMMERCIAL_COPY,
  commercialErrorMessage,
  DUPLICATE_MATCH_LABELS,
  formatDateOnly,
  mergeBlocker,
  suggestedKeep,
} from "@meguiars/domain";
import { createCommercialRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MergeClientsForm } from "@/components/commercial-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { commercialCenters } from "@/lib/commercial";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Duplicados por teléfono o email en los centros donde la persona puede fusionar. */
export default async function DuplicatesPage() {
  const state = await requireScreen("duplicates");
  const centers = commercialCenters(state, "clients.merge");
  const result = await createCommercialRepository((await createSupabaseServerClient())!).duplicates(
    centers.map((c) => c.id),
  );
  return (
    <AppShell
      state={state}
      screen="duplicates"
      title={COMMERCIAL_COPY.duplicatesTitle}
      description={centers.map((c) => c.name).join(" · ")}
    >
      <p className="text-sm text-muted">{COMMERCIAL_COPY.duplicatesHint}</p>
      {!result.ok ? (
        <EmptyState
          title="No se pudieron revisar los duplicados"
          message={commercialErrorMessage(result.error)}
        />
      ) : result.data.length === 0 ? (
        <EmptyState title={COMMERCIAL_COPY.duplicatesEmpty} />
      ) : (
        <div className="flex flex-col gap-md" data-testid="duplicate-pairs">
          {result.data.map((pair) => {
            const side = (s: typeof pair.a) => (
              <div className="flex flex-col gap-xxs text-sm">
                <Link href={`/comercial/clientes/${s.clientId}`} className="font-medium underline">
                  {s.name}
                </Link>
                <span className="text-muted">
                  {s.phone}
                  {s.email ? ` · ${s.email}` : ""}
                </span>
                <span className="text-muted">
                  Alta {formatDateOnly(s.createdAt.slice(0, 10))} · {s.orders} OS
                  {s.activeMemberships ? ` · ${s.activeMemberships} membresía activa` : ""}
                  {s.b2b ? " · cuenta B2B" : ""}
                </span>
              </div>
            );
            return (
              <Card
                key={`${pair.a.clientId}-${pair.b.clientId}`}
                title={`${pair.a.name} / ${pair.b.name}`}
                actions={
                  <span className="flex flex-wrap gap-xs">
                    {pair.matchedOn.map((m) => (
                      <Badge
                        key={m}
                        label={DUPLICATE_MATCH_LABELS[m]}
                        tone={m === "nombre_parecido" ? "neutral" : "warning"}
                      />
                    ))}
                  </span>
                }
              >
                <div className="grid gap-md md:grid-cols-2">
                  {side(pair.a)}
                  {side(pair.b)}
                </div>
                <div className="mt-md">
                  <MergeClientsForm
                    pair={pair}
                    suggested={suggestedKeep(pair)}
                    blockers={{ a: mergeBlocker(pair.a, pair.b), b: mergeBlocker(pair.b, pair.a) }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
