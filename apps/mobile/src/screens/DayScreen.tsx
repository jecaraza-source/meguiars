import { DAY_COPY, sectionCopy } from "@meguiars/domain";
import {
  createCashRepository,
  createDayRepository,
  createPaymentRepository,
  createPnlRepository,
} from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { loadDayView, loadFinanceSummary } from "@/lib/day";
import { Button, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { dashboardStyles as styles } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

type DayView = Awaited<ReturnType<typeof loadDayView>>;
type FinanceView = Awaited<ReturnType<typeof loadFinanceSummary>>;

/** Operación del día (equivale a /operacion en web). */
export function DayScreen({
  state,
  header,
  subnav,
  onOrder,
  onAppointment,
  onNewOrder,
  onNewAppointment,
}: PrivateScreenProps & {
  onOrder: (id: string) => void;
  onAppointment: (id: string) => void;
  onNewOrder: () => void;
  onNewAppointment: () => void;
}) {
  const { client } = useAuth();
  const [d, setD] = useState<DayView | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadDayView(state, createDayRepository(client)).then((v) => active && setD(v));
    return () => {
      active = false;
    };
  }, [client, state, version]);

  return (
    <Screen title={DAY_COPY.title} description={DAY_COPY.description} header={header}>
      {subnav}
      <View style={styles.row}>
        {d?.canNewOrder ? <Button label={DAY_COPY.newOrder} onPress={onNewOrder} /> : null}
        {d?.canNewAppointment ? (
          <Button label={DAY_COPY.newAppointment} variant="secondary" onPress={onNewAppointment} />
        ) : null}
        <LinkButton label="Actualizar" onPress={() => setVersion((x) => x + 1)} />
      </View>
      {!d ? <Skeleton /> : null}
      <Notice text={d?.error} tone="danger" />
      {d?.view ? (
        <>
          <View style={styles.grid}>
            {d.view.kpis.map((k) => (
              <View key={k.key} style={styles.half}>
                <KpiCard label={k.label} value={k.value} {...(k.caption ? { caption: k.caption } : {})} />
              </View>
            ))}
          </View>
          {d.view.showOrders ? (
            <Card title={DAY_COPY.activeTitle}>
              {d.view.active.length === 0 ? <EmptyState title={DAY_COPY.activeEmpty} /> : null}
              {d.view.active.map((o) => (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  onPress={() => onOrder(o.id)}
                  style={styles.rowItem}
                >
                  <View style={styles.between}>
                    <Text style={textStyle("label")}>{o.folio}</Text>
                    <Badge label={o.status} tone={o.tone} />
                  </View>
                  <Text style={textStyle("bodySmall")}>
                    {o.client} · {o.vehicle}
                  </Text>
                  <Text style={textStyle("caption", "muted")}>
                    {[o.total, o.balance, o.where, o.promised].filter(Boolean).join(" · ")}
                  </Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
          {d.view.showAgenda ? (
            <Card title={DAY_COPY.agendaTitle}>
              {d.view.upcoming.length === 0 ? <EmptyState title={DAY_COPY.agendaEmpty} /> : null}
              {d.view.upcoming.map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  onPress={() => onAppointment(a.id)}
                  style={styles.between}
                >
                  <Text style={[textStyle("bodySmall"), styles.flex]}>
                    {a.time} · {a.client} · {a.vehicle}
                  </Text>
                  <Badge label={a.status} tone={a.tone} />
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Resumen financiero (equivale a /finanzas en web). */
export function FinanceSummaryScreen({
  state,
  header,
  subnav,
  onNavigate,
}: PrivateScreenProps & { onNavigate: (screen: "pnl" | "payments" | "cash") => void }) {
  const { client } = useAuth();
  const [s, setS] = useState<FinanceView | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadFinanceSummary(state, {
      pnl: createPnlRepository(client),
      payments: createPaymentRepository(client),
      cash: createCashRepository(client),
      day: createDayRepository(client),
    }).then((v) => active && setS(v));
    return () => {
      active = false;
    };
  }, [client, state]);
  const copy = sectionCopy.finanzas;
  const target = (href: string) =>
    href.includes("resultados") ? "pnl" : href.includes("caja") ? "cash" : "payments";
  return (
    <Screen title={copy.title} description={copy.description} header={header}>
      {subnav}
      {!s ? <Skeleton /> : null}
      <Notice text={s?.error} tone="danger" />
      {s && s.kpis.length === 0 && !s.error ? (
        <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} />
      ) : null}
      <View style={styles.grid}>
        {s?.kpis.map((k) => (
          <Pressable
            key={k.key}
            accessibilityRole="button"
            onPress={() => onNavigate(target(k.href))}
            style={styles.half}
          >
            <KpiCard label={k.label} value={k.value} {...(k.caption ? { caption: k.caption } : {})} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
