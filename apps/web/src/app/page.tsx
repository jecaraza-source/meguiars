import {
  activeCenterAccess,
  authCopy,
  canInActiveCenter,
  centersCopy,
  formatDateInCenterTimeZone,
  formatTimeInCenterTimeZone,
  presentCenterAccess,
} from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { CentersTable } from "@/components/centers-view";
import { EditCenterForm } from "@/components/forms";
import { ButtonLink } from "@/components/ui/button";
import { Card, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

export default async function Home() {
  const state = await requireScreen("home");
  const active = activeCenterAccess(state)!;
  const item = presentCenterAccess(active);
  const now = new Date();

  return (
    <AppShell state={state} screen="home" title={item.title} description={item.subtitle}>
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={centersCopy.rolesLabel}
          value={String(active.roles.length)}
          caption={item.rolesText}
        />
        <KpiCard
          label={centersCopy.localTimeLabel}
          value={formatTimeInCenterTimeZone(now, item.timezone)}
          caption={`${formatDateInCenterTimeZone(now, item.timezone)} · ${item.timezone}`}
        />
        <KpiCard
          label="Centros con acceso"
          value={String(state.access.length)}
          caption="en todas tus organizaciones"
        />
      </div>

      {/* La UI oculta lo que el rol no permite; RLS lo bloquea de todos modos. */}
      {canInActiveCenter(state, "center.manage") ? (
        <Card
          title={authCopy.editCenterTitle}
          subtitle="Los cambios quedan en la bitácora de auditoría con su motivo."
        >
          <EditCenterForm
            key={active.center.id}
            name={active.center.name}
            timezone={active.center.timezone}
          />
        </Card>
      ) : null}

      <Card
        title={centersCopy.title}
        subtitle={centersCopy.subtitle}
        actions={
          state.access.length > 1 ? (
            <ButtonLink href="/seleccionar-centro" label={authCopy.changeCenter} size="sm" />
          ) : null
        }
      >
        <CentersTable access={state.access} now={now} />
      </Card>
    </AppShell>
  );
}
