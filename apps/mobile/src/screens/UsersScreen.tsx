import {
  activeCenterAccess,
  presentOrgUser,
  USERS_COPY,
  usersErrorMessage,
  type OrgUserView,
} from "@meguiars/domain";
import { createUsersRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { dashboardStyles as styles } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

/**
 * Usuarios (equivale a /equipo/usuarios en web), en consulta: crear cuentas y
 * cambiar contraseñas usa la llave de servicio, que sólo vive en el servidor
 * web; por eso las altas se hacen en la web.
 */
export function UsersScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const organizationId = activeCenterAccess(state)!.center.organizationId;
  const [data, setData] = useState<{ users: OrgUserView[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createUsersRepository(client)
      .list(organizationId)
      .then((r) => {
        if (active)
          setData(
            r.ok
              ? { users: r.data.map(presentOrgUser), error: null }
              : { users: [], error: usersErrorMessage(r.error) },
          );
      });
    return () => {
      active = false;
    };
  }, [client, organizationId]);

  return (
    <Screen
      title={USERS_COPY.title}
      description="Consulta aquí; las altas y contraseñas se hacen en la web."
      header={header}
    >
      {subnav}
      {!data ? <Skeleton /> : null}
      <Notice text={data?.error} tone="danger" />
      {data && !data.error && data.users.length === 0 ? <EmptyState title={USERS_COPY.empty} /> : null}
      {data?.users.map((u) => (
        <Card key={u.id} title={u.name} subtitle={u.email}>
          <View style={styles.row}>
            <Badge label={u.status} tone={u.statusTone} />
          </View>
          <Text style={textStyle("bodySmall")}>{u.access}</Text>
          <Text style={textStyle("caption", "muted")}>Último acceso: {u.lastSignIn}</Text>
        </Card>
      ))}
    </Screen>
  );
}
