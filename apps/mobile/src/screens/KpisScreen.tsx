import { KPI_CATALOG, KPI_CATEGORIES, KPI_CATEGORY_LABELS, kpiValidFilters } from "@meguiars/analytics";
import {
  activeCenterAccess,
  dashboardFilterParams,
  dashboardFiltersLabel,
  dashboardSnapshotCsv,
  kpisCopy,
  kpiSheet,
  type DashboardDrillTarget,
  type KpiSettings,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { kpiDefinition, loadDashboardView } from "@/lib/dashboards";
import { Button } from "@/ui/controls";
import { Card, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { dashboardStyles as styles, FiltersCard, WidgetCard } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

type Params = Record<string, string | undefined>;
type View_ = Awaited<ReturnType<typeof loadDashboardView>>;

/**
 * Dirección → KPIs (equivale a /direccion/kpis en web): mismo registro, mismos
 * filtros y mismo cálculo; en una columna y con la ficha de cada KPI. Los
 * parámetros se consultan aquí y se cambian en la web.
 */
export function KpisScreen({
  state,
  header,
  subnav,
  onDrill,
}: PrivateScreenProps & { onDrill: (target: DashboardDrillTarget) => void }) {
  const { client } = useAuth();
  const organizationId = activeCenterAccess(state)!.center.organizationId;
  const [params, setParams] = useState<Params>({});
  const [view, setView] = useState<{ key: string; data: View_ } | null>(null);
  const [settings, setSettings] = useState<KpiSettings | null>(null);
  const viewKey = JSON.stringify(params);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createDashboardRepository(client);
    void Promise.all([
      loadDashboardView(state, repo, kpiDefinition(organizationId), null, params),
      repo.kpiSettings(organizationId),
    ]).then(([data, s]) => {
      if (!active) return;
      setView({ key: viewKey, data });
      if (s.ok) setSettings(s.data);
    });
    return () => {
      active = false;
    };
  }, [client, state, organizationId, params, viewKey]);

  const v = view?.key === viewKey ? view.data : null;
  const byId = new Map((v?.widgets ?? []).map((w) => [w.id, w]));
  const share = async () => {
    if (!v) return;
    await Share.share({
      title: `kpis-${v.filters.from}-${v.filters.to}.csv`,
      message: dashboardSnapshotCsv(kpisCopy.title, v.filters, v.centerName, v.widgets),
    });
  };

  return (
    <Screen title={kpisCopy.title} description={kpisCopy.description} header={header}>
      {subnav}
      {v ? (
        <FiltersCard
          key={viewKey}
          initial={dashboardFilterParams(
            v.filters,
            v.centers.map((c) => c.id),
          )}
          centers={v.centers}
          onApply={setParams}
        />
      ) : null}
      {v ? (
        <Text style={textStyle("bodySmall", "muted")}>{dashboardFiltersLabel(v.filters, v.centerName)}</Text>
      ) : null}
      <Button
        label="Compartir CSV"
        variant="secondary"
        size="sm"
        disabled={!v}
        onPress={() => void share()}
      />
      {!v ? <Skeleton lines={8} /> : null}
      {v?.error ? <Notice text={v.error} tone="danger" /> : null}
      {v && !v.error
        ? KPI_CATEGORIES.map((category) => (
            <View key={category} style={styles.rowItem}>
              <Text accessibilityRole="header" style={textStyle("heading", "accent")}>
                {KPI_CATEGORY_LABELS[category]}
              </Text>
              <View style={styles.grid}>
                {KPI_CATALOG.filter((k) => k.category === category).map((k) => {
                  const w = byId.get(k.id);
                  return w ? (
                    <WidgetCard key={k.id} widget={w} onDrill={onDrill}>
                      <KpiSheetToggle rows={kpiSheet({ ...k, validFilters: kpiValidFilters(k) })} />
                    </WidgetCard>
                  ) : null;
                })}
              </View>
            </View>
          ))
        : null}
      {settings ? (
        <Card title={kpisCopy.settings} subtitle={kpisCopy.settingsHint}>
          <Text style={textStyle("bodySmall")}>
            {kpisCopy.settingsSummary(
              settings.ltvLifetimeYears,
              settings.operatingHoursPerDay,
              settings.operatingDaysPerWeek,
            )}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function KpiSheetToggle({ rows }: { rows: { label: string; value: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.details}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((x) => !x)}>
        <Text style={textStyle("caption", "muted")}>
          {open ? "▾" : "▸"} {kpisCopy.sheet}
        </Text>
      </Pressable>
      {open
        ? rows.map((r) => (
            <Text key={r.label} style={textStyle("caption", "muted")}>
              {r.label}: {r.value}
            </Text>
          ))
        : null}
    </View>
  );
}
