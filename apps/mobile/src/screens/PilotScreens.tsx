import { BASELINE_METRIC_INFO, formatPilotMetric, PILOT_COPY, PILOT_PERIODS } from "@meguiars/domain";
import { createPilotRepository, createPnlRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { loadCenters, loadCenterSetup, loadPilot } from "@/lib/pilot";
import { Button, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { dashboardStyles as styles } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

type CentersView = Awaited<ReturnType<typeof loadCenters>>;
type SetupView = Awaited<ReturnType<typeof loadCenterSetup>>;
type PilotView = Awaited<ReturnType<typeof loadPilot>>;

/**
 * Administración → Centros (equivale a /equipo/centros). En móvil se consulta
 * el checklist; el alta de centros, la línea base y el importador son de la web
 * (trabajo de escritorio con archivos y motivos).
 */
export function CentersScreen({
  state,
  header,
  subnav,
  onOpen,
}: PrivateScreenProps & { onOpen: (id: string) => void }) {
  const { client } = useAuth();
  const [v, setV] = useState<CentersView | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadCenters(state, createPilotRepository(client)).then((x) => active && setV(x));
    return () => {
      active = false;
    };
  }, [client, state]);
  return (
    <Screen title={PILOT_COPY.centersTitle} description={PILOT_COPY.centersDescription} header={header}>
      {subnav}
      {!v ? <Skeleton /> : null}
      {v && v.rows.length === 0 ? <EmptyState title="Sin centros para configurar" /> : null}
      {v?.rows.map((c) => (
        <Pressable key={c.id} accessibilityRole="button" onPress={() => onOpen(c.id)}>
          <Card title={c.name} subtitle={`${c.code} · ${c.timezone}`}>
            <View style={styles.row}>
              {c.isActive ? <Badge label="Centro activo" /> : null}
              {c.view ? <Badge label={c.view.readyLabel} tone={c.view.readyTone} /> : null}
            </View>
            {c.view ? <Text style={textStyle("bodySmall", "muted")}>{c.view.progress}</Text> : null}
            <Notice text={c.error} tone="danger" />
          </Card>
        </Pressable>
      ))}
      {v && !v.scope.canCreate ? <Notice text={PILOT_COPY.onlyCorporate} /> : null}
      {v?.scope.canCreate ? (
        <Notice text="Da de alta centros nuevos desde la web (Administración → Centros)." />
      ) : null}
    </Screen>
  );
}

/** Activación de un centro (equivale a /equipo/centros/[id]): checklist, línea base y errores. */
export function CenterSetupScreen({
  state,
  header,
  subnav,
  centerId,
  onBack,
}: PrivateScreenProps & { centerId: string; onBack: () => void }) {
  const { client } = useAuth();
  const [v, setV] = useState<SetupView | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadCenterSetup(state, createPilotRepository(client), centerId).then((x) => active && setV(x));
    return () => {
      active = false;
    };
  }, [client, state, centerId]);
  const r = v?.readiness;
  return (
    <Screen
      title={v?.center ? `${PILOT_COPY.setupTitle}: ${v.center.name}` : PILOT_COPY.setupTitle}
      header={header}
    >
      {subnav}
      <LinkButton label={`← ${PILOT_COPY.centersTitle}`} onPress={onBack} />
      {!v ? <Skeleton /> : null}
      {v && !v.center ? <EmptyState title="Centro inexistente o sin permiso" /> : null}
      <Notice text={v?.error} tone="danger" />
      {r ? (
        <Card title={PILOT_COPY.checklist} subtitle={r.progress}>
          <Badge label={r.readyLabel} tone={r.readyTone} />
          {r.rows.map((row) => (
            <View key={row.key} style={styles.editorRow}>
              <View style={styles.row}>
                <Text style={textStyle("label")}>{row.label}</Text>
                <Badge label={row.status} tone={row.tone} />
              </View>
              <Text style={textStyle("bodySmall")}>{row.detail}</Text>
              {row.fix ? <Text style={textStyle("caption", "muted")}>{row.fix}</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}
      {v?.center ? (
        <Card title={PILOT_COPY.baselineTitle} subtitle={PILOT_COPY.baselineHelp}>
          {v.baselines.length === 0 ? (
            <Text style={textStyle("bodySmall", "muted")}>{PILOT_COPY.baselineEmpty}</Text>
          ) : null}
          {v.baselines.map((b) => (
            <View key={b.metric} style={styles.between}>
              <Text style={[textStyle("bodySmall"), styles.flex]}>
                {BASELINE_METRIC_INFO[b.metric].label}
              </Text>
              <Text style={textStyle("label")}>{formatPilotMetric(b.metric, b.value)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {v?.center ? (
        <Card title={PILOT_COPY.errorsTitle}>
          {v.errors.length === 0 ? (
            <Text style={textStyle("bodySmall", "muted")}>{PILOT_COPY.errorsEmpty}</Text>
          ) : null}
          {v.errors.map((e) => (
            <View key={e.id} style={styles.rowItem}>
              <Text style={textStyle("caption", "muted")}>
                {e.occurredAt.slice(0, 16).replace("T", " ")} · {e.source === "mobile" ? "Móvil" : "Web"} ·{" "}
                {e.route ?? "—"}
              </Text>
              <Text style={textStyle("bodySmall")}>
                {e.name}: {e.message}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

/** Dirección → Piloto (equivale a /direccion/piloto). */
export function PilotScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const [period, setPeriod] = useState<string>("30");
  const [scope, setScope] = useState<"centro" | "todos">("centro");
  const [v, setV] = useState<PilotView | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadPilot(
      state,
      { pilot: createPilotRepository(client), pnl: createPnlRepository(client) },
      { period, scope },
    ).then((x) => active && setV(x));
    return () => {
      active = false;
    };
  }, [client, state, period, scope]);
  const t = v?.adoption.totals;
  return (
    <Screen title={PILOT_COPY.pilotTitle} description={PILOT_COPY.pilotDescription} header={header}>
      {subnav}
      <View style={styles.row}>
        {PILOT_PERIODS.map((p) => (
          <Button
            key={p.id}
            label={p.label}
            size="sm"
            variant={p.id === period ? "primary" : "secondary"}
            onPress={() => setPeriod(p.id)}
          />
        ))}
        {v?.canScopeAll ? (
          <LinkButton
            label={scope === "todos" ? "Sólo el centro activo" : "Todos mis centros"}
            onPress={() => setScope(scope === "todos" ? "centro" : "todos")}
          />
        ) : null}
      </View>
      {v ? (
        <Text style={textStyle("caption", "muted")}>{`${v.period.from} a ${v.period.to}`}</Text>
      ) : (
        <Skeleton />
      )}
      <Notice text={v?.error} tone="danger" />
      {t ? (
        <View style={styles.grid}>
          <View style={styles.half}>
            <KpiCard
              label="Usuarios activos por día"
              value={String(t.avgActiveUsers)}
              caption={`Máximo ${t.maxActiveUsers}`}
            />
          </View>
          <View style={styles.half}>
            <KpiCard
              label="OS creadas / entregadas"
              value={`${t.ordersCreated} / ${t.ordersDelivered}`}
              caption={`${t.ordersCancelled} canceladas`}
            />
          </View>
          <View style={styles.half}>
            <KpiCard label="Cortes de caja" value={String(t.cashClosings)} />
          </View>
          <View style={styles.half}>
            <KpiCard label="Errores de la app" value={String(t.errors)} />
          </View>
        </View>
      ) : null}
      {v?.centers.map((c) => (
        <Card key={c.id} title={`${PILOT_COPY.comparison} · ${c.name}`}>
          {c.comparison.map((r) => (
            <View key={r.metric} style={styles.editorRow}>
              <View style={styles.between}>
                <Text style={[textStyle("label"), styles.flex]}>{r.label}</Text>
                <Badge label={r.statusLabel} tone={r.tone} />
              </View>
              <Text
                style={textStyle("caption", "muted")}
              >{`Base ${r.baseline} · Piloto ${r.actual} · ${r.delta}`}</Text>
            </View>
          ))}
        </Card>
      ))}
      {v ? (
        <Card title={PILOT_COPY.adoption}>
          {v.adoption.days.length === 0 ? (
            <Text style={textStyle("bodySmall", "muted")}>{PILOT_COPY.noData}</Text>
          ) : null}
          {v.adoption.days.map((d) => (
            <View key={d.day} style={styles.between}>
              <Text style={textStyle("bodySmall")}>{d.day}</Text>
              <Text style={textStyle("caption", "muted")}>
                {`${d.activeUsers} usuarios · ${d.ordersCreated}/${d.ordersDelivered} OS · ${d.errors} errores`}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
