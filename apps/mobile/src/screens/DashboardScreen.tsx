import {
  applyPreferences,
  DASHBOARD_CHANNEL_KEYS,
  DASHBOARD_CHANNEL_LABELS,
  DASHBOARD_ENGINE_KEYS,
  DASHBOARD_ENGINE_LABELS,
  dashboardFilterParams,
  dashboardFiltersLabel,
  dashboardsCopy,
  dashboardsErrorMessage,
  dashboardSnapshotCsv,
  moveInOrder,
  PNL_PERIOD_LABELS,
  PNL_PERIODS,
  savedFiltersOf,
  type DashboardDefinition,
  type DashboardDrillTarget,
  type DashboardPreferences,
  type PresentedWidget,
  type ViewState,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { colors, radius, space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { loadDashboardView } from "@/lib/dashboards";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

type Params = Record<string, string | undefined>;
type Loaded = { dashboard: DashboardDefinition; prefs: DashboardPreferences | null };
type View_ = Awaited<ReturnType<typeof loadDashboardView>>;

/**
 * Visor del tablero (equivale a /direccion/tableros/[id] en web): mismos
 * filtros, mismo servicio de métricas y mismos valores; rejilla adaptada a una
 * columna y ajustes simples de orden y visibilidad (vista personal).
 */
export function DashboardScreen({
  state,
  header,
  subnav,
  dashboardId,
  onBack,
  onDrill,
}: PrivateScreenProps & {
  dashboardId: string;
  onBack: () => void;
  onDrill: (target: DashboardDrillTarget) => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<ViewState<Loaded>>({ status: "loading" });
  const [params, setParams] = useState<Params>({});
  const [view, setView] = useState<{ key: string; data: View_ } | null>(null);
  const [customize, setCustomize] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createDashboardRepository(client);
    void Promise.all([repo.get(dashboardId), repo.preferences()]).then(([d, p]) => {
      if (!active) return;
      setLoaded(
        d.ok
          ? {
              status: "ready",
              data: {
                dashboard: d.data,
                prefs: (p.ok ? p.data : []).find((x) => x.dashboardId === dashboardId) ?? null,
              },
            }
          : { status: "error", message: dashboardsErrorMessage(d.error) },
      );
    });
    return () => {
      active = false;
    };
  }, [client, dashboardId, reload]);

  const viewKey = `${reload}|${JSON.stringify(params)}`;
  useEffect(() => {
    if (!client || loaded.status !== "ready") return;
    let active = true;
    void loadDashboardView(
      state,
      createDashboardRepository(client),
      loaded.data.dashboard,
      loaded.data.prefs,
      params,
    ).then((data) => {
      if (active) setView({ key: viewKey, data });
    });
    return () => {
      active = false;
    };
  }, [client, state, loaded, params, viewKey]);

  if (loaded.status !== "ready") {
    return (
      <Screen title={dashboardsCopy.title} header={header}>
        {subnav}
        <LinkButton label={`← ${dashboardsCopy.title}`} onPress={onBack} />
        {loaded.status === "loading" ? (
          <Skeleton />
        ) : (
          <EmptyState title={loaded.status === "error" ? loaded.message : ""} />
        )}
      </Screen>
    );
  }
  const { dashboard: d, prefs } = loaded.data;
  const v = view?.key === viewKey ? view.data : null;
  const allowedIds = v?.centers.map((c) => c.id) ?? [];

  const share = async () => {
    if (!v) return;
    await Share.share({
      title: `tablero-${v.filters.from}-${v.filters.to}.csv`,
      message: dashboardSnapshotCsv(d.name, v.filters, v.centerName, v.widgets),
    });
  };

  return (
    <Screen title={d.name} description={d.description ?? undefined} header={header}>
      {subnav}
      <LinkButton label={`← ${dashboardsCopy.title}`} onPress={onBack} />
      {v ? (
        <FiltersCard
          key={viewKey}
          initial={dashboardFilterParams(v.filters, allowedIds)}
          centers={v.centers}
          onApply={setParams}
        />
      ) : null}
      {v ? (
        <Text style={textStyle("bodySmall", "muted")}>{dashboardFiltersLabel(v.filters, v.centerName)}</Text>
      ) : null}
      <View style={dashboardStyles.row}>
        <Button
          label={dashboardsCopy.shareCsv}
          variant="secondary"
          size="sm"
          disabled={!v}
          onPress={() => void share()}
        />
        <Button
          label={customize ? dashboardsCopy.done : dashboardsCopy.customize}
          variant="secondary"
          size="sm"
          onPress={() => setCustomize((c) => !c)}
        />
      </View>
      {customize && v ? (
        <ViewEditor
          key={`${reload}`}
          dashboard={d}
          prefs={prefs}
          titleOf={(id) => v.widgets.find((w) => w.id === id)?.title}
          onSave={async (order, hidden, favorite) => {
            if (!client) return;
            const r = await createDashboardRepository(client).savePreferences({
              dashboardId: d.id,
              widgetOrder: order,
              hiddenWidgetIds: hidden,
              filters: savedFiltersOf(v.filters, allowedIds),
              isFavorite: favorite,
            });
            toast(
              r.ok
                ? { message: dashboardsCopy.viewSaved, tone: "success" }
                : { message: dashboardsErrorMessage(r.error), tone: "danger" },
            );
            if (r.ok) {
              setCustomize(false);
              setReload((n) => n + 1);
            }
          }}
          onReset={async () => {
            if (!client) return;
            const r = await createDashboardRepository(client).resetPreferences(d.id);
            if (r.ok) {
              setParams({});
              setCustomize(false);
              setReload((n) => n + 1);
            } else toast({ message: dashboardsErrorMessage(r.error), tone: "danger" });
          }}
        />
      ) : null}
      {!v ? <Skeleton lines={6} /> : null}
      {v?.error ? <Notice text={v.error} tone="danger" /> : null}
      {v && !v.error && v.widgets.length === 0 ? <EmptyState title={dashboardsCopy.noData} /> : null}
      <View style={dashboardStyles.grid}>
        {(v?.widgets ?? []).map((w) => (
          <WidgetCard key={w.id} widget={w} onDrill={onDrill} />
        ))}
      </View>
    </Screen>
  );
}

export function FiltersCard({
  initial,
  centers,
  onApply,
}: {
  initial: Record<string, string>;
  centers: { id: string; name: string }[];
  onApply: (p: Params) => void;
}) {
  const [draft, setDraft] = useState<Params>(initial);
  const [open, setOpen] = useState(false);
  const chosen = draft.centros ? draft.centros.split(",") : centers.map((c) => c.id);
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...new Set([...chosen, id])] : chosen.filter((x) => x !== id);
    setDraft((p) => ({
      ...p,
      centros: next.length === centers.length || next.length === 0 ? undefined : next.join(","),
    }));
  };
  if (!open) return <LinkButton label={`${dashboardsCopy.filters} ▾`} onPress={() => setOpen(true)} />;
  return (
    <Card title={dashboardsCopy.filters}>
      <Select
        label={dashboardsCopy.period}
        value={draft.periodo ?? "mes"}
        onChange={(periodo) => setDraft((p) => ({ ...p, periodo }))}
        options={PNL_PERIODS.map((k) => ({ value: k, label: PNL_PERIOD_LABELS[k] }))}
      />
      {draft.periodo === "personalizado" ? (
        <View style={dashboardStyles.row}>
          <Field
            label={dashboardsCopy.from}
            value={draft.desde ?? ""}
            onChangeText={(desde) => setDraft((p) => ({ ...p, desde }))}
          />
          <Field
            label={dashboardsCopy.to}
            value={draft.hasta ?? ""}
            onChangeText={(hasta) => setDraft((p) => ({ ...p, hasta }))}
          />
        </View>
      ) : null}
      <Select
        label={dashboardsCopy.channel}
        value={draft.canal ?? ""}
        onChange={(canal) => setDraft((p) => ({ ...p, canal: canal || undefined }))}
        options={[
          { value: "", label: dashboardsCopy.all },
          ...DASHBOARD_CHANNEL_KEYS.map((c) => ({ value: c, label: DASHBOARD_CHANNEL_LABELS[c] })),
        ]}
      />
      <Select
        label={dashboardsCopy.engine}
        value={draft.motor ?? ""}
        onChange={(motor) => setDraft((p) => ({ ...p, motor: motor || undefined }))}
        options={[
          { value: "", label: dashboardsCopy.all },
          ...DASHBOARD_ENGINE_KEYS.map((e) => ({ value: e, label: DASHBOARD_ENGINE_LABELS[e] })),
        ]}
      />
      <Text style={textStyle("label")}>{dashboardsCopy.centers}</Text>
      {centers.map((c) => (
        <Checkbox
          key={c.id}
          label={c.name}
          checked={chosen.includes(c.id)}
          onChange={(on) => toggle(c.id, on)}
        />
      ))}
      <Button
        label={dashboardsCopy.apply}
        size="sm"
        onPress={() => {
          setOpen(false);
          onApply({ ...draft, periodo: draft.periodo ?? "mes" });
        }}
      />
    </Card>
  );
}

function ViewEditor({
  dashboard,
  prefs,
  titleOf,
  onSave,
  onReset,
}: {
  dashboard: DashboardDefinition;
  prefs: DashboardPreferences | null;
  titleOf: (id: string) => string | undefined;
  onSave: (order: string[], hidden: string[], favorite: boolean) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const { visible, hidden } = applyPreferences(dashboard.widgets, prefs);
  const name = (id: string) => {
    const w = dashboard.widgets.find((x) => x.id === id);
    return titleOf(id) ?? w?.title ?? w?.metricId ?? id;
  };
  const [order, setOrder] = useState([...visible, ...hidden].map((w) => w.id));
  const [off, setOff] = useState(hidden.map((w) => w.id));
  const [favorite, setFavorite] = useState(prefs?.isFavorite ?? false);
  const [busy, setBusy] = useState(false);
  return (
    <Card title={dashboardsCopy.myView} subtitle={dashboardsCopy.hiddenWidgets}>
      {order.map((id, i) => (
        <View key={id} style={dashboardStyles.editorRow}>
          <Text
            style={[textStyle("bodySmall", off.includes(id) ? "muted" : "foreground"), dashboardStyles.flex]}
          >
            {name(id)}
          </Text>
          <View style={dashboardStyles.row}>
            <Button
              label={dashboardsCopy.moveUp}
              size="sm"
              variant="ghost"
              disabled={i === 0}
              onPress={() => setOrder((o) => moveInOrder(o, id, -1))}
            />
            <Button
              label={dashboardsCopy.moveDown}
              size="sm"
              variant="ghost"
              disabled={i === order.length - 1}
              onPress={() => setOrder((o) => moveInOrder(o, id, 1))}
            />
            <Button
              label={off.includes(id) ? dashboardsCopy.show : dashboardsCopy.hide}
              size="sm"
              variant="secondary"
              onPress={() => setOff((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))}
            />
          </View>
        </View>
      ))}
      <Checkbox label={dashboardsCopy.setFavorite} checked={favorite} onChange={setFavorite} />
      <View style={dashboardStyles.row}>
        <Button
          label={dashboardsCopy.saveView}
          size="sm"
          loading={busy}
          onPress={() => {
            setBusy(true);
            void onSave(order, off, favorite).finally(() => setBusy(false));
          }}
        />
        <Button
          label={dashboardsCopy.resetView}
          size="sm"
          variant="secondary"
          onPress={() => void onReset()}
        />
      </View>
    </Card>
  );
}

export function WidgetCard({
  widget: w,
  onDrill,
  children,
}: {
  widget: PresentedWidget;
  onDrill: (t: DashboardDrillTarget) => void;
  /** Contenido extra (p. ej. la ficha del KPI). */
  children?: React.ReactNode;
}) {
  const [details, setDetails] = useState(false);
  return (
    <View
      style={[dashboardStyles.widget, w.type === "kpi" ? dashboardStyles.half : dashboardStyles.full]}
      accessibilityLabel={w.title}
    >
      <Text style={textStyle("bodySmall", "muted")}>{w.title}</Text>
      {w.subtitle ? <Text style={textStyle("caption", "muted")}>{w.subtitle}</Text> : null}
      {w.value !== null ? <Text style={textStyle("kpi")}>{w.value}</Text> : null}
      {w.message ? <Text style={textStyle("bodySmall", "muted")}>{w.message}</Text> : null}
      {!w.message && w.type === "timeseries" ? (
        <View>
          <View
            style={dashboardStyles.series}
            accessible
            accessibilityLabel={w.rows.map((r) => `${r.label}: ${r.value}`).join(", ")}
          >
            {w.rows.map((r) => (
              <View
                key={r.key}
                style={[dashboardStyles.column, { height: `${Math.max(r.pct, r.raw === 0 ? 0 : 2)}%` }]}
              />
            ))}
          </View>
          <View style={dashboardStyles.between}>
            <Text style={textStyle("caption", "muted")}>{w.rows[0]?.label}</Text>
            <Text style={textStyle("caption", "muted")}>{w.rows[w.rows.length - 1]?.label}</Text>
          </View>
        </View>
      ) : null}
      {!w.message && w.type !== "timeseries"
        ? w.rows.map((r, i) => (
            <View key={r.key} style={dashboardStyles.rowItem}>
              <View style={dashboardStyles.between}>
                <Text style={[textStyle("bodySmall"), dashboardStyles.flex]}>
                  {w.type === "ranking" ? `${i + 1}. ` : ""}
                  {r.label}
                </Text>
                <Text style={textStyle("label")}>
                  {r.value}
                  {r.share ? ` · ${r.share}` : ""}
                </Text>
              </View>
              <View style={dashboardStyles.track}>
                <View style={[dashboardStyles.bar, { width: `${r.pct}%` }]} />
              </View>
            </View>
          ))
        : null}
      {w.notes.map((n) => (
        <Notice key={n} text={n} tone="warning" />
      ))}
      <View style={dashboardStyles.between}>
        {w.formula ? (
          <Pressable accessibilityRole="button" onPress={() => setDetails((x) => !x)}>
            <Text style={textStyle("caption", "muted")}>
              {details ? "▾" : "▸"} {dashboardsCopy.formula}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        {w.drill && w.status === "ok" ? (
          <LinkButton label={`${dashboardsCopy.drill} →`} onPress={() => onDrill(w.drill!)} />
        ) : null}
      </View>
      {details ? (
        <View style={dashboardStyles.details}>
          <Text style={textStyle("caption", "muted")}>
            {dashboardsCopy.definition}: {w.definition}
          </Text>
          <Text style={textStyle("caption", "muted")}>
            {dashboardsCopy.formula}: {w.formula}
          </Text>
          <Text style={textStyle("caption", "muted")}>
            {dashboardsCopy.source}: {w.source}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export const dashboardStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  widget: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  half: { flexBasis: "46%", flexGrow: 1 },
  full: { flexBasis: "100%" },
  flex: { flex: 1 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  rowItem: { gap: space.xxs },
  track: { height: space.xs, borderRadius: radius.full, backgroundColor: colors.surface },
  bar: { height: space.xs, borderRadius: radius.full, backgroundColor: colors.brand },
  series: { height: space.xxxl * 2, flexDirection: "row", alignItems: "flex-end", gap: space.xxs },
  column: { flex: 1, backgroundColor: colors.brand, borderRadius: radius.sm },
  editorRow: {
    gap: space.xs,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: space.xs,
  },
  details: { gap: space.xxs },
});
