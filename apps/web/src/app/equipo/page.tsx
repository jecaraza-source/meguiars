import { activeCenterAccess, authCopy, ROLE_LABELS } from "@meguiars/domain";
import { createAccessRepository } from "@meguiars/supabase";
import { AppHeader } from "@/components/app-header";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeamPage() {
  const state = await requireScreen("team");
  const center = activeCenterAccess(state)!;
  const client = (await createSupabaseServerClient())!;
  // Sólo el centro activo: los datos de otro centro nunca se mezclan.
  const members = await createAccessRepository(client).listCenterMembers(center.center.id);
  return (
    <>
      <AppHeader state={state} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">
          {authCopy.teamTitle} · {center.center.name}
        </h1>
        {!members.ok ? (
          <p role="alert" className="text-mg-danger">
            {members.error.kind === "permission_denied" ? authCopy.forbidden : members.error.message}
          </p>
        ) : members.data.length === 0 ? (
          <p className="text-mg-muted">{authCopy.teamEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-mg-border rounded-lg border border-mg-border">
            {members.data.map((m) => (
              <li key={m.userId} className="flex justify-between gap-3 p-3">
                <span>{m.fullName ?? m.userId}</span>
                <span className="text-sm text-mg-muted">
                  {ROLE_LABELS[m.role]}
                  {m.active ? "" : " · inactivo"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
