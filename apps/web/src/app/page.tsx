import {
  activeCenterAccess,
  authCopy,
  canInActiveCenter,
  centersCopy,
  formatInCenterTimeZone,
  presentCenterAccess,
} from "@meguiars/domain";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CentersView } from "@/components/centers-view";
import { EditCenterForm } from "@/components/forms";
import { requireScreen } from "@/lib/auth/dal";

export default async function Home() {
  const state = await requireScreen("home");
  const active = activeCenterAccess(state)!;
  const item = presentCenterAccess(active);
  const now = new Date();

  return (
    <>
      <AppHeader state={state} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <section className="flex flex-col gap-2 rounded-lg border border-mg-border p-4">
          <p className="text-sm text-mg-muted">{authCopy.activeCenterLabel}</p>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <p className="text-sm text-mg-muted">{item.subtitle}</p>
          <p className="text-sm">
            {centersCopy.rolesLabel}: {item.rolesText}
          </p>
          <p className="text-sm text-mg-muted">
            {centersCopy.localTimeLabel}: {formatInCenterTimeZone(now, item.timezone)} ({item.timezone})
          </p>
          {/* La UI oculta lo que el rol no permite; RLS lo bloquea de todos modos. */}
          {canInActiveCenter(state, "members.read") ? (
            <Link href="/equipo" className="text-sm underline">
              {authCopy.teamTitle}
            </Link>
          ) : null}
        </section>

        {canInActiveCenter(state, "center.manage") ? (
          <section className="flex flex-col gap-3 rounded-lg border border-mg-border p-4">
            <h2 className="text-lg font-semibold">{authCopy.editCenterTitle}</h2>
            <EditCenterForm
              key={active.center.id}
              name={active.center.name}
              timezone={active.center.timezone}
            />
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{centersCopy.title}</h2>
          <CentersView state={{ status: "ready", data: state.access }} now={now} />
        </section>
      </main>
    </>
  );
}
