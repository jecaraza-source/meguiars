import { CORPORATE_CARDS, EXECUTIVE_SUMMARY_SIZE, sortMix, type MixSort } from "@meguiars/analytics";
import {
  corporateCopy,
  corporatePeriodLabel,
  corporateSnapshotCsv,
  dashboardFilterParams,
  presentMixRows,
  presentReconciliation,
  presentThreshold,
  type CorporateDrillPath,
  type PresentedCard,
  type PresentedCell,
  type PresentedTrend,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { CentersList } from "@/components/CentersView";
import { loadCorporateView } from "@/lib/corporate";
import { Button, LinkButton } from "@/ui/controls";
import { Badge, Card, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { dashboardStyles, FiltersCard } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

type Params = Record<string, string | undefined>;
type View_ = Awaited<ReturnType<typeof loadCorporateView>>;

const TREND_TONE = { good: "success", bad: "danger", neutral: "neutral", none: "neutral" } as const;

export function TrendBadge({ trend }: { trend: PresentedTrend }) {
  return <Badge label={trend.text} tone={TREND_TONE[trend.tone]} />;
}

/**
 * Dirección → Tablero corporativo (equivale a /direccion en web): mismo
 * cálculo y filtros. En móvil primero el resumen ejecutivo (las tarjetas
 * principales y las alertas), luego el comparativo por centro y el ranking;
 * cada cifra abre el drill-down navegable.
 */
export function DireccionScreen({
  state,
  header,
  subnav,
  params,
  onParams,
  onDrill,
}: PrivateScreenProps & {
  /** Filtros del tablero (los conserva el Router al volver del detalle). */
  params: Params;
  onParams: (p: Params) => void;
  onDrill: (path: CorporateDrillPath, filterParams: Record<string, string>) => void;
}) {
  const { client } = useAuth();
  const [view, setView] = useState<{ key: string; data: View_ } | null>(null);
  const [sort, setSort] = useState<MixSort>("revenue");
  const viewKey = JSON.stringify(params);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadCorporateView(state, createDashboardRepository(client), params).then((data) => {
      if (active) setView({ key: viewKey, data });
    });
    return () => {
      active = false;
    };
  }, [client, state, params, viewKey]);

  const v = view?.key === viewKey ? view.data : null;
  const filterParams = v ? dashboardFilterParams(v.filters, v.allowedCenterIds) : {};
  const drill = (path: CorporateDrillPath) => onDrill(path, filterParams);
  const share = async () => {
    if (!v) return;
    await Share.share({
      title: `tablero-corporativo-${v.filters.from}-${v.filters.to}.csv`,
      message: corporateSnapshotCsv(v.filters, v.centerName, v.board),
    });
  };
  const summary = v?.cards.slice(0, EXECUTIVE_SUMMARY_SIZE) ?? [];
  const rest = v?.cards.slice(EXECUTIVE_SUMMARY_SIZE) ?? [];
  const alerts = (v?.cards ?? []).flatMap((c) =>
    [c.consolidated, ...c.centers]
      .filter((x): x is PresentedCell => Boolean(x?.alert))
      .map((x) => ({ card: c, cell: x })),
  );

  return (
    <Screen title={corporateCopy.title} description={corporateCopy.description} header={header}>
      {subnav}
      {v ? (
        <FiltersCard
          key={viewKey}
          initial={filterParams}
          centers={v.centers}
          onApply={(p) => onParams(p)}
          channelAndEngine={false}
        />
      ) : null}
      {v ? (
        <Text style={textStyle("bodySmall", "muted")}>
          {corporatePeriodLabel(v.filters.from, v.filters.to)} · {v.chosen.map((c) => c.name).join(", ")} ·{" "}
          {corporateCopy.vsPrevious(corporatePeriodLabel(v.previous.from, v.previous.to))}
        </Text>
      ) : null}
      {!v ? <Skeleton lines={8} /> : null}
      {v?.error ? <Notice text={v.error} tone="danger" /> : null}

      {v && !v.error ? (
        <>
          <Text accessibilityRole="header" style={textStyle("heading", "accent")}>
            {corporateCopy.executiveSummary}
          </Text>
          <View style={dashboardStyles.grid}>
            {summary.map((c) => (
              <CardTile key={c.id} card={c} onPress={() => drill(c.path)} big />
            ))}
          </View>
          {alerts.length > 0 ? (
            <Card title={corporateCopy.alerts(alerts.length)}>
              {alerts.map(({ card, cell }) => (
                <Pressable
                  key={`${card.id}:${cell.key}`}
                  accessibilityRole="button"
                  onPress={() => drill(cell.path)}
                  style={styles.line}
                >
                  <Text style={textStyle("bodySmall", "danger")}>
                    ⚠ {card.name} · {cell.label}: {cell.value} — {cell.alert!.text}
                  </Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
          <View style={dashboardStyles.grid}>
            {rest.map((c) => (
              <CardTile key={c.id} card={c} onPress={() => drill(c.path)} />
            ))}
          </View>
          <Card
            title={corporateCopy.comparison}
            subtitle={corporateCopy.vsPrevious(corporatePeriodLabel(v.previous.from, v.previous.to))}
          >
            {v.cards.map((c) => (
              <Comparison key={c.id} card={c} onDrill={drill} />
            ))}
          </Card>
          {v.mix ? (
            <Card title={corporateCopy.mixTitle}>
              {v.mix.status === "forbidden" ? (
                <Text style={textStyle("bodySmall", "muted")}>{corporateCopy.mixForbidden}</Text>
              ) : (
                <>
                  <View style={dashboardStyles.row}>
                    <Text style={textStyle("caption", "muted")}>{corporateCopy.sortBy}:</Text>
                    <Button
                      label={corporateCopy.sortRevenue}
                      size="sm"
                      variant={sort === "revenue" ? "primary" : "secondary"}
                      onPress={() => setSort("revenue")}
                    />
                    <Button
                      label={corporateCopy.sortMargin}
                      size="sm"
                      variant={sort === "margin" ? "primary" : "secondary"}
                      onPress={() => setSort("margin")}
                    />
                  </View>
                  {(
                    [
                      [corporateCopy.byEngine, v.mix.byEngine],
                      [corporateCopy.byService, v.mix.byService],
                    ] as const
                  ).map(([title, rows]) => (
                    <View key={title} style={styles.block}>
                      <Text style={textStyle("label")}>{title}</Text>
                      {presentMixRows(sortMix(rows, sort)).map((r) => (
                        <View key={r.key} style={dashboardStyles.rowItem}>
                          <View style={dashboardStyles.between}>
                            <Text style={[textStyle("bodySmall"), dashboardStyles.flex]}>{r.label}</Text>
                            <Text style={textStyle("bodySmall", r.negative ? "danger" : "foreground")}>
                              {r.revenue}
                            </Text>
                          </View>
                          <Text style={textStyle("caption", "muted")}>
                            {corporateCopy.margin}: {r.margin} ({r.marginPct}) · {corporateCopy.share}:{" "}
                            {r.share}
                          </Text>
                          <View style={dashboardStyles.track}>
                            <View style={[dashboardStyles.bar, { width: `${r.pct}%` }]} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                  {(
                    [
                      [v.mix.revenueReconciliation, v.mix.revenueDifference],
                      [v.mix.marginReconciliation, v.mix.marginDifference],
                    ] as const
                  ).map(([lines, diff], i) => {
                    const r = presentReconciliation(lines, diff);
                    return (
                      <View key={i} style={styles.block}>
                        {r.lines.map((l) => (
                          <View key={l.label} style={dashboardStyles.between}>
                            <Text style={textStyle(l.total ? "label" : "caption")}>{l.label}</Text>
                            <Text style={textStyle(l.total ? "label" : "caption")}>{l.amount}</Text>
                          </View>
                        ))}
                        <Notice text={r.status} tone={r.ok ? "success" : "warning"} />
                      </View>
                    );
                  })}
                </>
              )}
            </Card>
          ) : null}
          <Card title={corporateCopy.thresholds} subtitle={corporateCopy.thresholdsReadOnly}>
            {v.thresholds.length === 0 ? (
              <Text style={textStyle("bodySmall", "muted")}>{corporateCopy.noThresholds}</Text>
            ) : null}
            {v.thresholds.map((t) => {
              const card = CORPORATE_CARDS.find((c) => c.metricId === t.metricId && c.channel === t.channel);
              const p = presentThreshold(
                t,
                card?.name ?? t.metricId,
                card?.metric.unit ?? "currency",
                v.centerName,
              );
              return (
                <Text key={t.id} style={textStyle("bodySmall")}>
                  {p.card} · {p.center} · {p.limits}
                </Text>
              );
            })}
          </Card>
          <Button label={corporateCopy.shareCsv} variant="secondary" size="sm" onPress={() => void share()} />
        </>
      ) : null}
      <Card title="Centros">
        <CentersList access={state.access} now={new Date()} />
      </Card>
    </Screen>
  );
}

function CardTile({ card, onPress, big }: { card: PresentedCard; onPress: () => void; big?: boolean }) {
  const c = card.consolidated;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}: ${c?.value ?? card.message}`}
      onPress={onPress}
      style={[dashboardStyles.widget, dashboardStyles.half, c?.alert ? styles.alert : null]}
    >
      <Text style={textStyle("bodySmall", "muted")}>{card.name}</Text>
      {c ? (
        <>
          <Text style={textStyle(big ? "kpi" : "heading")}>{c.value}</Text>
          <View style={dashboardStyles.row}>
            <TrendBadge trend={c.trend} />
            {c.alert ? <Badge label={`⚠ ${c.alert.kind}`} tone="danger" /> : null}
          </View>
          <Text style={textStyle("caption", "muted")}>{c.trend.hint}</Text>
        </>
      ) : (
        <Text style={textStyle("bodySmall", "muted")}>{card.message}</Text>
      )}
    </Pressable>
  );
}

function Comparison({ card, onDrill }: { card: PresentedCard; onDrill: (p: CorporateDrillPath) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.block}>
      <LinkButton
        label={`${open ? "▾" : "▸"} ${card.name}: ${card.consolidated?.value ?? "—"}`}
        onPress={() => setOpen((x) => !x)}
      />
      {open && card.status === "ok"
        ? [...card.centers, card.consolidated!].map((cell) => (
            <Pressable
              key={cell.key}
              accessibilityRole="button"
              onPress={() => onDrill(cell.path)}
              style={[dashboardStyles.between, styles.line]}
            >
              <Text
                style={[textStyle("bodySmall", cell.alert ? "danger" : "foreground"), dashboardStyles.flex]}
              >
                {cell.label}
                {cell.alert ? " ⚠" : ""}
              </Text>
              <Text style={textStyle("bodySmall")}>{cell.value}</Text>
              <TrendBadge trend={cell.trend} />
            </Pressable>
          ))
        : null}
      {open && card.message ? <Text style={textStyle("caption", "muted")}>{card.message}</Text> : null}
      {open
        ? card.notes.map((n) => (
            <Text key={n} style={textStyle("caption", "muted")}>
              {n}
            </Text>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xs },
  line: { paddingVertical: space.xs },
  alert: { borderWidth: 2 },
});
