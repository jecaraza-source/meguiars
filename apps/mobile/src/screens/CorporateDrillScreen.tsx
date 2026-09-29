import {
  corporateCopy,
  corporateDrillParams,
  corporatePeriodLabel,
  type CorporateDrillPath,
  type DashboardDrillTarget,
  type PresentedDrillLevel,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { loadCorporateDrill } from "@/lib/corporate";
import { LinkButton } from "@/ui/controls";
import { Card, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { dashboardStyles } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

type View_ = Awaited<ReturnType<typeof loadCorporateDrill>>;

/**
 * Detalle de un KPI del tablero corporativo (equivale a /direccion/detalle en
 * web): KPI → centro → canal/motor → servicio → OS, o → renglón del P&L →
 * movimientos; mismos filtros y conciliación por nivel.
 */
export function CorporateDrillScreen({
  state,
  header,
  subnav,
  params,
  onNavigate,
  onBack,
  onPnl,
}: PrivateScreenProps & {
  /** Filtros del tablero + posición del drill-down (mismos parámetros que la URL web). */
  params: Record<string, string>;
  onNavigate: (params: Record<string, string>) => void;
  onBack: () => void;
  onPnl: (target: DashboardDrillTarget) => void;
}) {
  const { client } = useAuth();
  const [view, setView] = useState<{ key: string; data: View_ } | null>(null);
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadCorporateDrill(state, createDashboardRepository(client), params).then((data) => {
      if (active) setView({ key, data });
    });
    return () => {
      active = false;
    };
  }, [client, state, params, key]);

  const v = view?.key === key ? view.data : null;
  const go = (path: CorporateDrillPath) => {
    if (v) onNavigate(corporateDrillParams(path, v.filters, v.allowedCenterIds));
  };

  return (
    <Screen
      title={v?.card ? `${corporateCopy.drillTitle}: ${v.card.name}` : corporateCopy.drillTitle}
      description={v?.card?.metric.description ?? corporateCopy.description}
      header={header}
    >
      {subnav}
      <LinkButton label={`← ${corporateCopy.back}`} onPress={onBack} />
      {v ? (
        <View style={dashboardStyles.row}>
          {v.breadcrumbs.map((b, i) => (
            <Pressable
              key={b.href}
              accessibilityRole="button"
              disabled={i === v.breadcrumbs.length - 1}
              onPress={() => go(b.path)}
            >
              <Text style={textStyle("bodySmall", i === v.breadcrumbs.length - 1 ? "foreground" : "accent")}>
                {i > 0 ? "› " : ""}
                {b.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {v ? (
        <Text style={textStyle("caption", "muted")}>
          {corporatePeriodLabel(v.filters.from, v.filters.to)} · {v.chosen.map((c) => c.name).join(", ")}
        </Text>
      ) : null}
      {!v ? <Skeleton lines={6} /> : null}
      {v?.error ? <Notice text={v.error} tone="danger" /> : null}
      {v?.levels.map((l) => (
        <Level key={l.kind} level={l} onGo={go} onPnl={onPnl} />
      ))}
      {v?.note ? <Text style={textStyle("bodySmall", "muted")}>{v.note}</Text> : null}
    </Screen>
  );
}

function Level({
  level,
  onGo,
  onPnl,
}: {
  level: PresentedDrillLevel;
  onGo: (p: CorporateDrillPath) => void;
  onPnl: (t: DashboardDrillTarget) => void;
}) {
  return (
    <Card title={level.title} subtitle={`${level.parentLabel}: ${level.parentValue}`}>
      {level.rows.length === 0 ? (
        <Text style={textStyle("bodySmall", "muted")}>
          {level.kind === "os" ? corporateCopy.orderLinesEmpty : corporateCopy.levelEmpty}
        </Text>
      ) : null}
      {level.rows.map((r) => {
        const t = r.target;
        const onPress = t ? () => (t.kind === "drill" ? onGo(t.path) : onPnl(t.target)) : undefined;
        return (
          <Pressable
            key={r.key}
            accessibilityRole={onPress ? "button" : undefined}
            disabled={!onPress}
            onPress={onPress}
            style={[dashboardStyles.rowItem, styles.row]}
          >
            <View style={dashboardStyles.between}>
              <Text
                style={[
                  textStyle(r.level === 0 ? "label" : "bodySmall", onPress ? "accent" : "foreground"),
                  dashboardStyles.flex,
                ]}
              >
                {r.label}
                {onPress ? " ›" : ""}
              </Text>
              <Text
                style={textStyle(r.level === 0 ? "label" : "bodySmall", r.raw < 0 ? "danger" : "foreground")}
              >
                {r.value}
                {r.share ? ` · ${r.share}` : ""}
              </Text>
            </View>
            {r.detail ? <Text style={textStyle("caption", "muted")}>{r.detail}</Text> : null}
            {level.kind !== "pnl" ? (
              <View style={dashboardStyles.track}>
                <View style={[dashboardStyles.bar, { width: `${r.pct}%` }]} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {level.sum !== null ? (
        <View style={dashboardStyles.between}>
          <Text style={textStyle("caption", "muted")}>{corporateCopy.sum}</Text>
          <Text style={textStyle("label")}>{level.sum}</Text>
        </View>
      ) : null}
      {level.reconciliation ? (
        <Notice text={level.reconciliation.text} tone={level.reconciliation.ok ? "success" : "warning"} />
      ) : null}
      {level.note ? <Text style={textStyle("caption", "muted")}>{level.note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.xs },
});
