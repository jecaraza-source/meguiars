import {
  pnlByCenter,
  pnlEbitda,
  pnlGrossProfit,
  pnlNetBeforeTax,
  pnlRevenue,
  type PnlDrill,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  can,
  formatMoney,
  formatPercent,
  PNL_PERIOD_LABELS,
  PNL_PERIODS,
  pnlCopy,
  pnlErrorMessage,
  pnlItemLabel,
  pnlPeriod,
  pnlPeriodError,
  pnlStatementCsv,
  pnlSummaryKpis,
  todayIn,
  usableCenters,
  type PnlDrillQuery,
  type PnlLineRow,
  type PnlPeriodKey,
  type ViewState,
} from "@meguiars/domain";
import { createPnlRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Card, EmptyState, KpiCard, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Estado de resultados por centro y consolidado (equivale a /finanzas/resultados en web). */
export function PnlScreen({
  state,
  header,
  subnav,
  onDrill,
}: PrivateScreenProps & { onDrill: (query: PnlDrillQuery) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [all, setAll] = useState(false);
  const [key, setKey] = useState<PnlPeriodKey>("mes");
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [draft, setDraft] = useState(custom);
  const [column, setColumn] = useState("consolidado");
  const { from, to } = pnlPeriod(key, today, custom);
  const periodError = pnlPeriodError(from, to);
  const allowed = usableCenters(state.access).filter((a) =>
    can([...a.roles, ...a.corporateRoles], "pnl.read"),
  );
  const centers = all ? allowed.map((a) => a.center) : [center];
  const queryKey = `${all}-${from}-${to}-${center.id}`;
  const [loaded, setLoaded] = useState<{ key: string; view: ViewState<PnlLineRow[]> } | null>(null);
  const data: ViewState<PnlLineRow[]> = periodError
    ? { status: "error", message: periodError }
    : loaded?.key === queryKey
      ? loaded.view
      : { status: "loading" };

  useEffect(() => {
    if (!client || periodError) return;
    let active = true;
    const ids = all
      ? usableCenters(state.access)
          .filter((a) => can([...a.roles, ...a.corporateRoles], "pnl.read"))
          .map((a) => a.center.id)
      : [center.id];
    void createPnlRepository(client)
      .lines(ids, from, to)
      .then((r) => {
        if (active)
          setLoaded({
            key: queryKey,
            view: r.ok
              ? { status: "ready", data: r.data }
              : { status: "error", message: pnlErrorMessage(r.error) },
          });
      });
    return () => {
      active = false;
    };
  }, [client, all, from, to, center.id, state.access, queryKey, periodError]);

  const facts = data.status === "ready" ? data.data : [];
  const { centers: byCenter, consolidated } = pnlByCenter(
    facts,
    centers.map((c) => c.id),
  );
  const multi = all && centers.length > 1;
  const columns = [
    { id: "consolidado", name: multi ? pnlCopy.consolidated : center.name, s: consolidated, centerId: null },
    ...(multi ? byCenter : []).map((c) => ({
      id: c.detailCenterId,
      name: centers.find((x) => x.id === c.detailCenterId)?.name ?? "",
      s: c.statement,
      centerId: c.detailCenterId,
    })),
  ];
  const selected = columns.find((c) => c.id === column) ?? columns[0]!;
  const drill = (d: PnlDrill, centerId: string | null) =>
    onDrill({
      detailCenterIds: centerId ? [centerId] : centers.map((c) => c.id),
      from,
      to,
      section: d.section,
      line: d.line,
      dimension: d.dimension,
    });
  const csv = pnlStatementCsv(
    [...columns.slice(1), columns[0]!].map((c) => ({ name: c.name, lines: c.s.lines })),
    { from, to },
  );

  return (
    <Screen title={pnlCopy.title} description={pnlCopy.description} header={header}>
      {subnav}
      <Card subtitle={`${PNL_PERIOD_LABELS[key]}: ${from} a ${to} · ${all ? pnlCopy.scopeAll : center.name}`}>
        <Select
          label={pnlCopy.period}
          options={PNL_PERIODS.map((p) => ({ value: p, label: PNL_PERIOD_LABELS[p] }))}
          value={key}
          onChange={(v) => setKey(v as PnlPeriodKey)}
        />
        {key === "personalizado" ? (
          <View style={styles.form}>
            <Field
              label={`${pnlCopy.from} (AAAA-MM-DD)`}
              value={draft.from}
              onChangeText={(v) => setDraft((d) => ({ ...d, from: v }))}
            />
            <Field
              label={`${pnlCopy.to} (AAAA-MM-DD)`}
              value={draft.to}
              onChangeText={(v) => setDraft((d) => ({ ...d, to: v }))}
            />
            <Button label={pnlCopy.apply} variant="secondary" onPress={() => setCustom(draft)} />
          </View>
        ) : null}
        <LinkButton
          label={all ? pnlCopy.scopeCenter : pnlCopy.scopeAll}
          onPress={() => {
            setAll((v) => !v);
            setColumn("consolidado");
          }}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando estado de resultados" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <Notice tone="danger" text={data.message} />
      ) : null}
      {data.status === "ready" && facts.length === 0 ? <EmptyState title={pnlCopy.empty} /> : null}
      {data.status === "ready" && facts.length > 0 ? (
        <>
          {pnlSummaryKpis(consolidated).map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
          <Card title={pnlCopy.title} subtitle={pnlCopy.drillHint}>
            {multi ? (
              <Select
                label="Columna"
                options={columns.map((c) => ({ value: c.id, label: c.name }))}
                value={selected.id}
                onChange={setColumn}
              />
            ) : null}
            {selected.s.lines.map((l) => (
              <Pressable
                key={l.key}
                accessibilityRole={l.drill && l.amount !== 0 ? "link" : "text"}
                disabled={!l.drill || l.amount === 0}
                onPress={() => l.drill && drill(l.drill, selected.centerId)}
                style={[styles.line, l.level === 1 ? styles.detail : null]}
              >
                <Text style={textStyle(l.level === 0 ? "label" : "bodySmall")}>{l.label}</Text>
                <Text
                  style={textStyle(
                    l.level === 0 ? "label" : "bodySmall",
                    l.drill && l.amount !== 0 ? "brand" : "foreground",
                  )}
                >
                  {formatMoney(l.amount)} · {formatPercent(l.percent)}
                </Text>
              </Pressable>
            ))}
            <Button
              label={pnlCopy.shareCsv}
              variant="secondary"
              onPress={() =>
                void Share.share({ title: `estado-de-resultados-${from}-${to}.csv`, message: csv })
              }
            />
          </Card>
          <Card title={pnlCopy.byEngine}>
            {selected.s.revenueByEngine.map((e) => (
              <Pressable
                key={e.engine}
                accessibilityRole="link"
                onPress={() => drill(e.drill, selected.centerId)}
                style={styles.line}
              >
                <Text style={textStyle("bodySmall")}>{pnlItemLabel(e.engine)}</Text>
                <Text style={textStyle("bodySmall", "brand")}>
                  {formatMoney(e.amount)} · {formatPercent(e.percent)}
                </Text>
              </Pressable>
            ))}
          </Card>
          <Card title={pnlCopy.outside}>
            <LinkButton
              label={`${pnlCopy.suppliesPurchases}: ${formatMoney(selected.s.suppliesPurchases)}`}
              onPress={() => drill({ section: "fuera_pnl", line: "insumos" }, selected.centerId)}
            />
            <LinkButton
              label={`${pnlCopy.pending}: ${formatMoney(selected.s.pending)}`}
              onPress={() => drill({ section: "fuera_pnl", line: "pendiente" }, selected.centerId)}
            />
            <Text style={textStyle("bodySmall")}>
              {pnlCopy.cashOut}: {formatMoney(selected.s.cashOut)}
            </Text>
          </Card>
        </>
      ) : null}
      <Card title={pnlCopy.formulas} subtitle={pnlCopy.formulasNote}>
        {[pnlRevenue, pnlGrossProfit, pnlEbitda, pnlNetBeforeTax].map((k) => (
          <Text key={k.id} style={textStyle("caption", "muted")}>
            {k.name}: {k.formula}
          </Text>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.sm },
  line: { flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingVertical: space.xxs },
  detail: { paddingLeft: space.lg },
});
