import {
  activeCenterAccess,
  authCopy,
  ROLE_LABELS,
  type CenterMember,
  type ViewState,
} from "@meguiars/domain";
import { createAccessRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Card, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import type { PrivateScreenProps } from "./types";

export function TeamScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [members, setMembers] = useState<ViewState<CenterMember[]>>({ status: "loading" });

  // Sólo el centro activo; al cambiar de centro se descarta la respuesta anterior.
  useEffect(() => {
    if (!client) return;
    let active = true;
    createAccessRepository(client)
      .listCenterMembers(center.id)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setMembers(
            result.error.kind === "permission_denied"
              ? { status: "permission_denied", message: authCopy.forbidden }
              : { status: "error", message: result.error.message },
          );
        } else {
          setMembers(result.data.length ? { status: "ready", data: result.data } : { status: "empty" });
        }
      });
    return () => {
      active = false;
    };
  }, [client, center.id]);

  return (
    <Screen title={`${authCopy.teamTitle} · ${center.name}`} header={header}>
      {subnav}
      <Card>
        {members.status === "loading" ? <Skeleton lines={3} label="Cargando equipo" /> : null}
        {members.status === "error" || members.status === "permission_denied" ? (
          <Notice tone="danger" text={members.message} />
        ) : null}
        {members.status === "empty" || members.status === "ready" ? (
          <List
            caption={authCopy.teamTitle}
            rows={members.status === "ready" ? members.data : []}
            rowKey={(m) => m.userId}
            emptyMessage={authCopy.teamEmpty}
            columns={[
              { key: "name", header: "Nombre", value: (m) => m.fullName ?? m.userId },
              { key: "role", header: "Rol", value: (m) => ROLE_LABELS[m.role] },
              { key: "status", header: "Estado", value: (m) => (m.active ? "Activo" : "Inactivo") },
            ]}
          />
        ) : null}
      </Card>
    </Screen>
  );
}
