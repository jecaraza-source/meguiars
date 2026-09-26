import {
  colorOf,
  colors,
  elevation,
  formatKpiDelta,
  kpiDeltaTone,
  kpiTrend,
  motion,
  radius,
  space,
  toneRecipes,
  TREND_SYMBOL,
  type BadgeContract,
  type CardContract,
  type EmptyStateContract,
  type KpiContract,
  type SkeletonContract,
  type TableContract,
} from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";
import { textStyle } from "./theme";

export function Card({ title, subtitle, children }: CardContract & { children?: React.ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? (
        <Text accessibilityRole="header" style={textStyle("heading")}>
          {title}
        </Text>
      ) : null}
      {subtitle ? <Text style={textStyle("bodySmall", "muted")}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function Badge({ label, tone = "neutral" }: BadgeContract) {
  const r = toneRecipes[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colorOf(r.bg), borderColor: colorOf(r.border) }]}>
      <Text style={[textStyle("caption"), { color: colorOf(r.fg) }]}>{label}</Text>
    </View>
  );
}

/** Pulso de opacidad; estático si el usuario pidió reducir el movimiento. */
export function Skeleton({ lines = 3, label = "Cargando…" }: SkeletonContract) {
  // useState (no useRef) para leer el valor animado durante el render.
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.45, duration: motion.pulse / 2, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: motion.pulse / 2, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [opacity]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.skeleton}>
      {Array.from({ length: lines }, (_, i) => (
        <Animated.View key={i} style={[styles.skeletonLine, { opacity, width: `${100 - i * 15}%` }]} />
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  children,
}: EmptyStateContract & { children?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={[textStyle("heading"), styles.center]}>{title}</Text>
      {message ? <Text style={[textStyle("bodySmall", "muted"), styles.center]}>{message}</Text> : null}
      {children}
    </View>
  );
}

export function KpiCard({ label, value, delta, higherIsBetter = true, caption }: KpiContract) {
  const trend = kpiTrend(delta);
  return (
    <View
      style={[styles.card, styles.kpi]}
      accessible
      accessibilityLabel={`${label}: ${value}${delta !== undefined ? `, ${formatKpiDelta(delta)}` : ""}`}
    >
      <Text style={textStyle("bodySmall", "muted")}>{label}</Text>
      <Text style={textStyle("kpi")}>{value}</Text>
      {delta !== undefined ? (
        <Badge
          label={`${TREND_SYMBOL[trend]} ${formatKpiDelta(delta)}`}
          tone={kpiDeltaTone(delta, higherIsBetter)}
        />
      ) : null}
      {caption ? <Text style={textStyle("caption", "muted")}>{caption}</Text> : null}
    </View>
  );
}

/** En móvil el contrato de tabla se presenta como lista de tarjetas (igual que la web en pantallas chicas). */
export function List<Row>({ caption, columns, rows, rowKey, emptyMessage }: TableContract<Row>) {
  if (rows.length === 0) return <EmptyState title={emptyMessage} />;
  return (
    <View accessibilityLabel={caption} style={styles.list}>
      {rows.map((row) => (
        <View key={rowKey(row)} style={styles.card}>
          {columns.map((c) => (
            <View key={c.key} style={styles.row}>
              <Text style={textStyle("bodySmall", "muted")}>{c.header}</Text>
              <Text style={[textStyle("bodySmall"), styles.value]}>{c.value(row)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    shadowColor: colors.foreground,
    shadowOpacity: elevation.sm.opacity,
    shadowRadius: elevation.sm.blur,
    shadowOffset: { width: 0, height: elevation.sm.y },
    elevation: elevation.sm.androidElevation,
  },
  kpi: { flexBasis: "47%", flexGrow: 1 },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  skeleton: { gap: space.sm },
  skeletonLine: { height: space.md, borderRadius: radius.sm, backgroundColor: colors.border },
  empty: {
    alignItems: "center",
    gap: space.sm,
    padding: space.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  center: { textAlign: "center" },
  list: { gap: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  value: { flexShrink: 1, textAlign: "right" },
});
