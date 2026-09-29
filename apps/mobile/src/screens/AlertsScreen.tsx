import {
  ALERT_INBOX_STATUS_LABELS,
  ALERT_INBOX_STATUSES,
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LABELS,
  ALERTS_COPY,
  alertInboxParams,
  type AlertInboxFilters,
} from "@meguiars/domain";
import { createAlertsRepository, createDashboardRepository } from "@meguiars/supabase";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { evaluateAlertsNow, loadAlertDetail, loadAlertRules, loadAlertsInbox } from "@/lib/alerts";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import { dashboardStyles as styles } from "./DashboardScreen";
import type { PrivateScreenProps } from "./types";

type Inbox = Awaited<ReturnType<typeof loadAlertsInbox>>;
type Detail = Awaited<ReturnType<typeof loadAlertDetail>>;
type Rules = Awaited<ReturnType<typeof loadAlertRules>>;

/** Parámetros de un enlace de la web ("/direccion/kpis?periodo=…") para abrir la pantalla móvil equivalente. */
export function paramsOf(href: string): Record<string, string> {
  const q = href.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(q).entries());
}

export interface AlertLinkHandlers {
  onKpis: (params: Record<string, string>) => void;
  onDrill: (params: Record<string, string>) => void;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}>
      <Badge label={label} tone={active ? "brand" : "neutral"} />
    </Pressable>
  );
}

/** Bandeja de alertas (equivale a /direccion/alertas en web): mismos filtros, orden y enlaces. */
export function AlertsScreen({
  state,
  header,
  subnav,
  onOpen,
  onRules,
  onKpis,
  onDrill,
}: PrivateScreenProps & AlertLinkHandlers & { onOpen: (id: string) => void; onRules: () => void }) {
  const { client } = useAuth();
  const [params, setParams] = useState<Record<string, string>>({});
  const [view, setView] = useState<{ key: string; data: Inbox } | null>(null);
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadAlertsInbox(state, createAlertsRepository(client), params).then((data) => {
      if (active) setView({ key, data });
    });
    return () => {
      active = false;
    };
  }, [client, state, params, key]);

  const v = view?.key === key ? view.data : null;
  const set = (patch: Partial<AlertInboxFilters>) =>
    v && setParams(alertInboxParams({ ...v.filters, ...patch }));

  return (
    <Screen title={ALERTS_COPY.title} header={header}>
      {subnav}
      {!v ? (
        <Skeleton />
      ) : (
        <>
          <Text style={textStyle("bodySmall")}>
            Abiertas: {v.counts.total}
            {ALERT_SEVERITIES.filter((s) => v.counts[s]).map(
              (s) => ` · ${ALERT_SEVERITY_LABELS[s]}: ${v.counts[s]}`,
            )}
          </Text>
          <View style={styles.row}>
            {ALERT_INBOX_STATUSES.map((s) => (
              <Chip
                key={s}
                label={ALERT_INBOX_STATUS_LABELS[s]}
                active={v.filters.status === s}
                onPress={() => set({ status: s })}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Chip label="Todas" active={!v.filters.severity} onPress={() => set({ severity: null })} />
            {ALERT_SEVERITIES.map((s) => (
              <Chip
                key={s}
                label={ALERT_SEVERITY_LABELS[s]}
                active={v.filters.severity === s}
                onPress={() => set({ severity: s })}
              />
            ))}
          </View>
          {v.scope.centers.length > 1 ? (
            <View style={styles.row}>
              <Chip
                label="Todos los centros"
                active={!v.filters.centerId}
                onPress={() => set({ centerId: null })}
              />
              {v.scope.centers.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  active={v.filters.centerId === c.id}
                  onPress={() => set({ centerId: c.id })}
                />
              ))}
            </View>
          ) : null}
          {v.scope.isAdmin ? <LinkButton label={ALERTS_COPY.rulesTitle} onPress={onRules} /> : null}
          <Notice text={v.error} tone="danger" />
          {!v.error && v.alerts.length === 0 ? <EmptyState title={ALERTS_COPY.empty} /> : null}
          {v.alerts.map(({ view: a, links }) => (
            <Card key={a.id} title={a.title} subtitle={`${a.metric} ${a.condition}`}>
              <View style={styles.row}>
                <Badge label={a.severity} tone={a.severityTone} />
                <Badge label={a.status} tone={a.statusTone} />
              </View>
              <Text style={textStyle("bodySmall")}>{a.scope}</Text>
              <Text style={textStyle("bodySmall", "muted")}>
                {a.period}: {a.value}
                {a.change ? ` (${a.change})` : ""} · {a.occurrences}
              </Text>
              {a.cleared ? <Text style={textStyle("caption", "muted")}>{a.cleared}</Text> : null}
              <View style={styles.row}>
                <LinkButton label="Ver detalle" onPress={() => onOpen(a.id)} />
                {links.kpis ? (
                  <LinkButton label={ALERTS_COPY.viewKpi} onPress={() => onKpis(paramsOf(links.kpis!))} />
                ) : null}
                {links.drill ? (
                  <LinkButton label={ALERTS_COPY.viewDrill} onPress={() => onDrill(paramsOf(links.drill!))} />
                ) : null}
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

/** Detalle de una alerta (equivale a /direccion/alertas/[id]): dato de origen, historial, revisar y resolver. */
export function AlertDetailScreen({
  state,
  header,
  alertId,
  onBack,
  onKpis,
  onDrill,
}: PrivateScreenProps & AlertLinkHandlers & { alertId: string; onBack: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [version, setVersion] = useState(0);
  const [reviewNote, setReviewNote] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadAlertDetail(state, createAlertsRepository(client), alertId).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [client, state, alertId, version]);

  const act = useCallback(
    async (kind: "review" | "resolve") => {
      if (!client) return;
      setBusy(true);
      setError(null);
      const repo = createAlertsRepository(client);
      const r =
        kind === "review"
          ? await repo.review(alertId, reviewNote || null)
          : await repo.resolve(alertId, resolveNote);
      setBusy(false);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      toast({
        message:
          kind === "review"
            ? "Alerta marcada como revisada."
            : `Alerta resuelta. ${ALERTS_COPY.resolvedKeepsHistory}`,
        tone: "success",
      });
      setVersion((x) => x + 1);
    },
    [client, alertId, reviewNote, resolveNote, toast],
  );

  const a = data?.alert;
  return (
    <Screen title={a ? a.view.title : ALERTS_COPY.title} header={header}>
      <LinkButton label={`← ${ALERTS_COPY.title}`} onPress={onBack} />
      {!data ? <Skeleton /> : null}
      <Notice text={data?.error ?? error} tone="danger" />
      {a ? (
        <>
          <Card title={a.view.metric} subtitle={`${a.view.condition} · ${a.view.scope}`}>
            <View style={styles.row}>
              <Badge label={a.view.severity} tone={a.view.severityTone} />
              <Badge label={a.view.status} tone={a.view.statusTone} />
            </View>
            <Text style={textStyle("bodySmall")}>
              Periodo que la originó: {a.view.period} · Valor: {a.view.value}
            </Text>
            {a.view.previous ? (
              <Text style={textStyle("bodySmall")}>
                Periodo anterior: {a.view.previous}
                {a.view.change ? ` · ${a.view.change}` : ""}
              </Text>
            ) : null}
            <Text style={textStyle("bodySmall", "muted")}>
              {a.view.occurrences}
              {a.view.last ? ` · última: ${a.view.last}` : ""}
            </Text>
            {a.view.resolutionNote ? (
              <Text style={textStyle("bodySmall")}>Resolución: {a.view.resolutionNote}</Text>
            ) : null}
            {a.view.cleared ? <Text style={textStyle("caption", "muted")}>{a.view.cleared}</Text> : null}
            <View style={styles.row}>
              {a.links.kpis ? (
                <LinkButton label={ALERTS_COPY.viewKpi} onPress={() => onKpis(paramsOf(a.links.kpis!))} />
              ) : null}
              {a.links.drill ? (
                <LinkButton label={ALERTS_COPY.viewDrill} onPress={() => onDrill(paramsOf(a.links.drill!))} />
              ) : null}
            </View>
          </Card>
          {a.canManage && a.view.canReview ? (
            <Card title={ALERTS_COPY.review}>
              <Field label={ALERTS_COPY.reviewNote} value={reviewNote} onChangeText={setReviewNote} />
              <Button
                label={ALERTS_COPY.review}
                variant="secondary"
                loading={busy}
                onPress={() => void act("review")}
              />
            </Card>
          ) : null}
          {a.canManage && a.view.canResolve ? (
            <Card title={ALERTS_COPY.resolve} subtitle={ALERTS_COPY.resolvedKeepsHistory}>
              <Field
                label={ALERTS_COPY.resolveNote}
                value={resolveNote}
                onChangeText={setResolveNote}
                required
              />
              <Button label={ALERTS_COPY.resolve} loading={busy} onPress={() => void act("resolve")} />
            </Card>
          ) : null}
          <Card title={ALERTS_COPY.history}>
            {data.events.map((e) => (
              <Text key={e.id} style={textStyle("bodySmall")}>
                {e.label}
                {e.detail ? ` · ${e.detail}` : ""} ({new Date(e.at).toLocaleString("es-MX")})
              </Text>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Reglas (admin corporativo): consulta y "Evaluar ahora" con el mismo runner
 * que la web. Crear y editar reglas es de la web (formulario largo).
 */
export function AlertRulesScreen({ state, header, onBack }: PrivateScreenProps & { onBack: () => void }) {
  const { client } = useAuth();
  const [data, setData] = useState<Rules | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadAlertRules(state, createAlertsRepository(client)).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [client, state, version]);

  const evaluate = async () => {
    if (!client) return;
    setBusy(true);
    const r = await evaluateAlertsNow(
      state,
      createAlertsRepository(client),
      createDashboardRepository(client),
    );
    setBusy(false);
    if (!r.ok) setResult({ text: r.error, tone: "danger" });
    else {
      const s = r.summary;
      const base = `Reglas evaluadas: ${s.rulesEvaluated}. Alertas nuevas: ${s.created.length}.`;
      setResult(
        s.errors.length
          ? { text: `${base} Con error: ${s.errors.map((e) => e.message).join("; ")}`, tone: "danger" }
          : { text: base, tone: "success" },
      );
    }
    setVersion((x) => x + 1);
  };

  return (
    <Screen title={ALERTS_COPY.rulesTitle} description={ALERTS_COPY.scheduleHelp} header={header}>
      <LinkButton label={`← ${ALERTS_COPY.title}`} onPress={onBack} />
      <Card title="Evaluación" subtitle="Diaria (programada) o manual con los mismos cálculos.">
        <Button
          label={ALERTS_COPY.evaluateNow}
          variant="secondary"
          loading={busy}
          onPress={() => void evaluate()}
        />
        <Notice text={result?.text} tone={result?.tone ?? "neutral"} />
      </Card>
      {!data ? <Skeleton /> : null}
      <Notice text={data?.error} tone="danger" />
      {data && data.rules.length === 0 && !data.error ? <EmptyState title={ALERTS_COPY.emptyRules} /> : null}
      {data?.rules.map(({ view: r }) => (
        <Card key={r.id} title={r.name} subtitle={`${r.metric} ${r.condition}`}>
          <View style={styles.row}>
            <Badge label={r.severity} tone={r.severityTone} />
            {r.active ? null : <Badge label="Inactiva" tone="neutral" />}
          </View>
          <Text style={textStyle("caption", "muted")}>
            {r.period} · {r.scope} · {r.cooldown}
          </Text>
          {r.warning ? <Text style={textStyle("caption", "danger")}>{r.warning}</Text> : null}
        </Card>
      ))}
      <Text style={textStyle("caption", "muted")}>
        Para crear o editar reglas usa la web (Dirección → Alertas → Reglas).
      </Text>
    </Screen>
  );
}
