import { activeCenterAccess, authCopy, ROLE_LABELS } from "@meguiars/domain";
import { createAccessRepository } from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeamPage() {
  const state = await requireScreen("team");
  const center = activeCenterAccess(state)!;
  const client = (await createSupabaseServerClient())!;
  // Sólo el centro activo: los datos de otro centro nunca se mezclan.
  const members = await createAccessRepository(client).listCenterMembers(center.center.id);
  return (
    <AppShell state={state} screen="team" title={`${authCopy.teamTitle} · ${center.center.name}`}>
      <Card>
        {!members.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {members.error.kind === "permission_denied" ? authCopy.forbidden : members.error.message}
          </p>
        ) : (
          <Table
            caption={authCopy.teamTitle}
            rows={members.data}
            rowKey={(m) => m.userId}
            emptyMessage={authCopy.teamEmpty}
            columns={[
              { key: "name", header: "Nombre", value: (m) => m.fullName ?? m.userId },
              { key: "role", header: "Rol", value: (m) => ROLE_LABELS[m.role] },
              { key: "status", header: "Estado", value: (m) => (m.active ? "Activo" : "Inactivo") },
            ]}
          />
        )}
        {members.ok && members.data.some((m) => !m.active) ? (
          <Badge label="Los miembros inactivos no tienen acceso al centro" tone="warning" />
        ) : null}
      </Card>
    </AppShell>
  );
}
