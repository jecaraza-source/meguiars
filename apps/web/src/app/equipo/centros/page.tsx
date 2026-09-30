import { PILOT_COPY } from "@meguiars/domain";
import { createPilotRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CreateCenterForm } from "@/components/pilot-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadCenters } from "@/lib/pilot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Administración → Centros: checklist de cada centro y alta de centros (rollout sin código). */
export default async function CentersPage() {
  const state = await requireScreen("centers");
  const view = await loadCenters(state, createPilotRepository((await createSupabaseServerClient())!));
  return (
    <AppShell
      state={state}
      screen="centers"
      title={PILOT_COPY.centersTitle}
      description={PILOT_COPY.centersDescription}
    >
      {view.rows.length === 0 ? <EmptyState title="Sin centros para configurar" /> : null}
      <ul className="flex flex-col gap-sm" data-testid="center-list">
        {view.rows.map((c) => (
          <li key={c.id} className="mg-card flex flex-col gap-xxs" data-testid={`center-${c.code}`}>
            <div className="flex flex-wrap items-center gap-xs">
              <Link href={`/equipo/centros/${c.id}`} className="font-medium underline">
                {c.name}
              </Link>
              <span className="text-sm text-muted">
                {c.code} · {c.timezone}
              </span>
              {c.isActive ? <Badge label="Centro activo" /> : null}
              {c.view ? <Badge label={c.view.readyLabel} tone={c.view.readyTone} /> : null}
            </div>
            {c.view ? <p className="text-sm text-muted">{c.view.progress}</p> : null}
            {c.error ? (
              <p role="alert" className="text-sm text-danger">
                {c.error}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <Card title={PILOT_COPY.newCenter}>
        {view.scope.canCreate ? (
          <CreateCenterForm />
        ) : (
          <p className="text-sm text-muted">{PILOT_COPY.onlyCorporate}</p>
        )}
      </Card>
    </AppShell>
  );
}
