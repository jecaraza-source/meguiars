import { ROLE_LABELS, USERS_COPY } from "@meguiars/domain";
import { createUsersRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card } from "@/components/ui/display";
import { AddRoleForm, DisableUserForm, PasswordForm, RemoveRoleForm } from "@/components/user-forms";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadUser } from "@/lib/users";

/** Ficha de un usuario: accesos, contraseña y estado. */
export default async function UserDetailPage({ params, searchParams }: PageProps<"/equipo/usuarios/[id]">) {
  const state = await requireScreen("userDetail");
  const { id } = await params;
  const sp = await searchParams;
  const view = await loadUser(state, createUsersRepository((await createSupabaseServerClient())!), id);
  const u = view.user;
  return (
    <AppShell state={state} screen="userDetail" title={u ? u.view.name : USERS_COPY.title}>
      <p className="text-sm">
        <Link href="/equipo/usuarios" className="underline">
          ← {USERS_COPY.title}
        </Link>
      </p>
      {sp.hecho === "creado" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          Usuario creado. Ya puede iniciar sesión con su correo y la contraseña que definiste.
        </p>
      ) : null}
      {!view.scope.canManage ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
          {USERS_COPY.onlyCorporate}
        </p>
      ) : !u ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error ?? "Usuario inexistente o sin acceso en esta organización."}
        </p>
      ) : (
        <>
          <Card title={u.view.email} subtitle={`Último acceso: ${u.view.lastSignIn}`}>
            <div className="flex flex-wrap gap-xs">
              <Badge label={u.view.status} tone={u.view.statusTone} />
              {view.isSelf ? <Badge label={USERS_COPY.self} tone="info" /> : null}
            </div>
            {u.raw.otherOrg ? <p className="text-sm text-muted">{USERS_COPY.otherOrg}</p> : null}
          </Card>
          <Card title="Accesos">
            <ul className="flex flex-col gap-sm" data-testid="user-roles">
              {u.raw.corporateRoles.map((r) => (
                <li key={r} className="flex flex-wrap items-center justify-between gap-sm">
                  <span className="text-sm">{ROLE_LABELS[r]} · corporativo (todos los centros)</span>
                  {view.isSelf ? null : <RemoveRoleForm userId={u.raw.userId} scope="corporativo" role={r} />}
                </li>
              ))}
              {u.raw.centerRoles.map((c) => (
                <li key={c.detailCenterId} className="flex flex-wrap items-center justify-between gap-sm">
                  <span className="text-sm">
                    {ROLE_LABELS[c.role]} · {c.centerName}
                    {c.active ? "" : " (inactivo)"}
                  </span>
                  {c.active ? (
                    <RemoveRoleForm
                      userId={u.raw.userId}
                      scope="centro"
                      detailCenterId={c.detailCenterId}
                      role={c.role}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <AddRoleForm userId={u.raw.userId} centers={view.scope.centers} />
          </Card>
          {u.view.manageable ? (
            <div className="grid gap-md md:grid-cols-2">
              <Card title={USERS_COPY.setPassword}>
                <PasswordForm userId={u.raw.userId} />
              </Card>
              {view.isSelf ? null : (
                <Card
                  title={u.raw.active ? USERS_COPY.disable : USERS_COPY.enable}
                  subtitle={u.raw.active ? undefined : USERS_COPY.disabledNote}
                >
                  <DisableUserForm userId={u.raw.userId} active={u.raw.active} />
                </Card>
              )}
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
