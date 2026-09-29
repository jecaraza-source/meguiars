import { corporateCopy, corporatePeriodLabel } from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DrillLevelView } from "@/components/corporate-board";
import { requireScreen } from "@/lib/auth/dal";
import { loadCorporateDrill } from "@/lib/corporate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Detalle de un KPI del tablero corporativo: KPI → centro → canal/motor →
 * servicio → OS (o → renglón del P&L → movimientos), con los mismos filtros
 * del tablero y la conciliación de cada nivel contra la cifra que explica.
 */
export default async function CorporateDrillPage({ searchParams }: PageProps<"/direccion/detalle">) {
  const state = await requireScreen("direccionDetalle");
  const view = await loadCorporateDrill(
    state,
    createDashboardRepository((await createSupabaseServerClient())!),
    await searchParams,
  );
  return (
    <AppShell
      state={state}
      screen="direccionDetalle"
      title={view.card ? `${corporateCopy.drillTitle}: ${view.card.name}` : corporateCopy.drillTitle}
      description={view.card?.metric.description ?? corporateCopy.description}
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <nav aria-label="Ruta del detalle" className="text-sm" data-testid="breadcrumbs">
          <ol className="flex flex-wrap gap-xs">
            <li>
              <Link href={view.backHref} className="underline">
                {corporateCopy.back}
              </Link>
            </li>
            {view.breadcrumbs.map((b, i) => (
              <li key={b.href} className="flex gap-xs">
                <span aria-hidden="true">›</span>
                {i === view.breadcrumbs.length - 1 ? (
                  <span aria-current="page" className="font-medium">
                    {b.label}
                  </span>
                ) : (
                  <Link href={b.href} className="underline">
                    {b.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <p className="text-sm text-muted">
          {corporatePeriodLabel(view.filters.from, view.filters.to)} ·{" "}
          {view.chosen.map((c) => c.name).join(", ")}
        </p>
      </div>
      {view.card ? <p className="text-xs text-muted">{view.card.metric.formula}</p> : null}
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      <div className="grid gap-md lg:grid-cols-2">
        {view.levels.map((l) => (
          <DrillLevelView key={l.kind} level={l} />
        ))}
      </div>
      {view.note ? <p className="text-sm text-muted">{view.note}</p> : null}
    </AppShell>
  );
}
