import {
  DASHBOARD_RANGE_LABELS,
  dashboardsCopy,
  dashboardsErrorMessage,
  ROLE_LABELS,
  type DashboardDefinition,
  type ViewState,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Tableros visibles para el usuario, favorito primero (equivale a /direccion/tableros en web). */
export function DashboardsScreen({
  state,
  header,
  subnav,
  onOpen,
}: PrivateScreenProps & { onOpen: (id: string) => void }) {
  const { client } = useAuth();
  const [view, setView] = useState<ViewState<{ list: DashboardDefinition[]; favorite?: string }>>({
    status: "loading",
  });
  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createDashboardRepository(client);
    void Promise.all([repo.list(), repo.preferences()]).then(([list, prefs]) => {
      if (!active) return;
      const favorite = prefs.ok ? prefs.data.find((p) => p.isFavorite)?.dashboardId : undefined;
      setView(
        list.ok
          ? {
              status: "ready",
              data: {
                list: [...list.data].sort((a, b) => Number(b.id === favorite) - Number(a.id === favorite)),
                favorite,
              },
            }
          : { status: "error", message: dashboardsErrorMessage(list.error) },
      );
    });
    return () => {
      active = false;
    };
  }, [client, state.activeCenterId]);

  return (
    <Screen title={dashboardsCopy.title} description={dashboardsCopy.description} header={header}>
      {subnav}
      {view.status === "loading" ? <Skeleton /> : null}
      {view.status === "error" ? <EmptyState title={view.message} /> : null}
      {view.status === "ready" && view.data.list.length === 0 ? (
        <EmptyState title={dashboardsCopy.empty} />
      ) : null}
      {view.status === "ready"
        ? view.data.list.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${d.name}`}
              onPress={() => onOpen(d.id)}
            >
              <Card title={d.name} subtitle={d.description ?? undefined}>
                <View style={styles.badges}>
                  {d.isDefault ? <Badge label={dashboardsCopy.corporate} tone="info" /> : null}
                  {d.id === view.data.favorite ? (
                    <Badge label={dashboardsCopy.favorite} tone="success" />
                  ) : null}
                  <Badge label={d.audienceRole ? ROLE_LABELS[d.audienceRole] : dashboardsCopy.audienceAll} />
                </View>
                <Text style={textStyle("caption", "muted")}>
                  {d.widgets.length} widgets · {DASHBOARD_RANGE_LABELS[d.defaultRange]}
                </Text>
              </Card>
            </Pressable>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
