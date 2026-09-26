import { membershipKpis } from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  canInActiveCenter,
  membershipKpiCards,
  membershipsCopy,
  sectionCopy,
  todayIn,
  usableCenters,
  type ViewState,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, LinkButton } from "@/ui/controls";
import { Card, EmptyState, KpiCard, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

type Cards = ReturnType<typeof membershipKpiCards>;

/** Resumen comercial con KPIs de membresías (equivale a /comercial en web). */
export function ComercialScreen({
  state,
  header,
  subnav,
  onMemberships,
}: PrivateScreenProps & { onMemberships: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [all, setAll] = useState(false);
  const [data, setData] = useState<ViewState<Cards>>({ status: "loading" });
  const copy = sectionCopy.comercial;

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
    const to = todayIn(center.timezone);
    const from = addDays(to, -29);
    void createMembershipRepository(client)
      .metricFacts(centers, from, to)
      .then((r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: r.error.message });
        setData(
          r.data.length === 0
            ? { status: "empty" }
            : { status: "ready", data: membershipKpiCards(membershipKpis({ facts: r.data, from, to })) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, all, center.id, center.timezone, state.access]);

  return (
    <Screen title={copy.title} description={copy.description} header={header}>
      {subnav}
      <Card
        title={membershipsCopy.kpisTitle}
        subtitle={`${membershipsCopy.kpisRange} · ${all ? membershipsCopy.scopeAll : center.name}`}
      >
        <LinkButton
          label={all ? membershipsCopy.scopeCenter : membershipsCopy.scopeAll}
          onPress={() => {
            setData({ status: "loading" });
            setAll((v) => !v);
          }}
        />
        {data.status === "loading" ? <Skeleton lines={4} label="Cargando indicadores" /> : null}
        {data.status === "empty" ? <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
        {data.status === "ready" ? (
          <View style={styles.kpis}>
            {data.data.map((k) => (
              <KpiCard key={k.label} label={k.label} value={k.value} caption={k.caption} />
            ))}
          </View>
        ) : null}
      </Card>
      {canInActiveCenter(state, "memberships.read") ? (
        <Button label={membershipsCopy.title} variant="secondary" onPress={onMemberships} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ kpis: { gap: space.md } });
