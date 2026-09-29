import { USERS_COPY } from "@meguiars/domain";
import { createUsersRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { CreateUserForm } from "@/components/user-forms";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadUsers } from "@/lib/users";

/** Administración → Usuarios: altas con correo y contraseña, roles y acceso (admin corporativo). */
export default async function UsersPage() {
  const state = await requireScreen("users");
  const view = await loadUsers(state, createUsersRepository((await createSupabaseServerClient())!));
  return (
    <AppShell state={state} screen="users" title={USERS_COPY.title} description={USERS_COPY.description}>
      {!view.scope.canManage ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
          {USERS_COPY.onlyCorporate}
        </p>
      ) : (
        <>
          {view.error ? (
            <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
              {view.error}
            </p>
          ) : null}
          {!view.error && view.users.length === 0 ? <EmptyState title={USERS_COPY.empty} /> : null}
          <ul className="flex flex-col gap-sm" data-testid="user-list">
            {view.users.map(({ view: u }) => (
              <li key={u.id} className="mg-card flex flex-col gap-xxs" data-testid={`user-${u.id}`}>
                <div className="flex flex-wrap items-center gap-xs">
                  <Link href={`/equipo/usuarios/${u.id}`} className="font-medium underline">
                    {u.name}
                  </Link>
                  <Badge label={u.status} tone={u.statusTone} />
                </div>
                <p className="text-sm break-all">{u.email}</p>
                <p className="text-xs text-muted">
                  {u.access} · Último acceso: {u.lastSignIn}
                </p>
              </li>
            ))}
          </ul>
          <Card title={USERS_COPY.newUser}>
            <CreateUserForm centers={view.scope.centers} />
          </Card>
        </>
      )}
    </AppShell>
  );
}
