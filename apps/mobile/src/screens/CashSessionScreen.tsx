import {
  canInCenter,
  cashCopy,
  cashDifference,
  cashErrorMessage,
  cashSessionActions,
  cashSummaryCsv,
  cashSummaryText,
  closeNoteRequired,
  formatDifference,
  formatMoney,
  newRequestId,
  presentCashSession,
  presentClosing,
  presentMovement,
  type CashSession,
  type ViewState,
} from "@meguiars/domain";
import { createCashRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { closeCashSchema, fieldErrors, reopenCashSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Ficha del corte (equivale a /finanzas/caja/[id] en web). */
export function CashSessionScreen({
  state,
  header,
  sessionId,
  onBack,
}: PrivateScreenProps & { sessionId: string; onBack: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ViewState<CashSession>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createCashRepository(client)
      .get(sessionId)
      .then((r) => {
        if (!active) return;
        setData(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "permission_denied", message: cashErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, sessionId, version]);

  const back = <LinkButton label={`← ${cashCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={cashCopy.title} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando corte" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={cashCopy.notFound} message={data.message} />
        ) : null}
      </Screen>
    );
  }

  const s = data.data;
  const view = presentCashSession(s);
  // Los permisos se evalúan en el centro del corte (puede no ser el activo).
  const actions = cashSessionActions(s.status, {
    operate: canInCenter(state, s.detailCenterId, "cash.operate"),
    reopen: canInCenter(state, s.detailCenterId, "cash.reopen"),
  });
  const done = (message: string) => {
    toast({ message, tone: "success" });
    reload();
  };

  return (
    <Screen title={view.title} description={`${view.center} · ${view.day}`} header={header}>
      {back}
      <Card title={cashCopy.summaryTitle} subtitle={view.window}>
        <Badge label={view.status} tone={view.statusTone} />
        <Text style={textStyle("caption", "muted")}>
          {cashCopy.openedBy}: {view.openedBy}
        </Text>
        {view.closedBy ? (
          <Text style={textStyle("caption", "muted")}>
            {cashCopy.closedBy}: {view.closedBy}
          </Text>
        ) : null}
        <Text style={textStyle("bodySmall")}>
          {cashCopy.openingFloat.replace(" (MXN)", "")}: {view.totals.openingFloat}
        </Text>
        <Text style={textStyle("bodySmall")}>
          {cashCopy.cashCollected}: {view.totals.cashCollected}
        </Text>
        <Text style={textStyle("bodySmall")}>
          {cashCopy.cashRefunded}: −{view.totals.cashRefunded}
        </Text>
        <Text style={textStyle("title")}>
          {cashCopy.expected}
          {s.status === "abierta" ? ` (${cashCopy.live.toLowerCase()})` : ""}: {view.totals.expected}
        </Text>
        {view.counted ? (
          <Text style={textStyle("title")}>
            {cashCopy.counted}: {view.counted}
          </Text>
        ) : null}
        {view.difference ? (
          <Badge label={`${cashCopy.difference}: ${view.difference.text}`} tone={view.difference.tone} />
        ) : null}
        {view.closingNotes ? <Text style={textStyle("bodySmall")}>{view.closingNotes}</Text> : null}
        {view.verified ? (
          <Notice tone={view.verified.ok ? "success" : "danger"} text={view.verified.text} />
        ) : null}
        <Button
          label={cashCopy.share}
          variant="secondary"
          onPress={() => void Share.share({ message: cashSummaryText(s) })}
        />
        <Button
          label={cashCopy.exportCsv}
          variant="secondary"
          onPress={() => void Share.share({ title: `${s.folio}.csv`, message: cashSummaryCsv(s) })}
        />
      </Card>

      <Card title={cashCopy.reconciliation} subtitle={view.totals.counts}>
        <Text style={textStyle("bodySmall")}>
          {cashCopy.card}: {view.totals.card} · {cashCopy.transfer}: {view.totals.transfer}
        </Text>
        <Text style={textStyle("bodySmall")}>
          {cashCopy.nonCash}: {view.totals.nonCash}
        </Text>
        {view.totals.methods.map((m) => (
          <Text key={m.method} style={textStyle("caption", "muted")}>
            {m.name}: {cashCopy.collected} {m.collected} · {cashCopy.refunded} {m.refunded} · {cashCopy.net}{" "}
            {m.net}
          </Text>
        ))}
      </Card>

      {actions.close ? (
        <Card title={cashCopy.closeTitle}>
          <CloseBox key={s.version} session={s} onDone={() => done(cashCopy.closed)} onConflict={reload} />
        </Card>
      ) : null}
      {actions.reopen ? (
        <Card title={cashCopy.reopen}>
          <ReopenBox key={s.version} session={s} onDone={() => done(cashCopy.reopened)} onConflict={reload} />
        </Card>
      ) : null}

      {s.closings.length > 0 ? (
        <Card title={cashCopy.history}>
          {s.closings.map((c) => {
            const p = presentClosing(c, s.centerTimezone);
            return (
              <View key={c.id} style={styles.item}>
                <Text style={textStyle("label")}>
                  {p.title} · {p.who}
                </Text>
                <Text style={textStyle("bodySmall")}>
                  {cashCopy.expected} {p.expected} · {cashCopy.counted} {p.counted} · {p.difference.text}
                </Text>
                {p.notes ? <Text style={textStyle("caption", "muted")}>{p.notes}</Text> : null}
              </View>
            );
          })}
          {s.reopenings.map((r, i) => (
            <Text key={i} style={textStyle("caption", "muted")}>
              {cashCopy.reopenings}: v{r.sequence} · {r.reopenedByName ?? "—"}: {r.reason}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card title={cashCopy.movements}>
        {s.movements.length === 0 ? <EmptyState title={cashCopy.movementsEmpty} /> : null}
        {s.movements.map((m, i) => {
          const p = presentMovement(m, s.centerTimezone);
          return (
            <Text key={i} style={textStyle("bodySmall")}>
              {p.when} · {p.what}
              {p.reversedLater ? " (revertido después)" : ""} · {p.methods} · {p.amount} · Efectivo {p.cash}
            </Text>
          );
        })}
      </Card>
    </Screen>
  );
}

/** Arqueo y cierre: diferencia en vivo contra el esperado; la base la recalcula al cerrar. */
function CloseBox({
  session,
  onDone,
  onConflict,
}: {
  session: CashSession;
  onDone: () => void;
  onConflict: () => void;
}) {
  const { client } = useAuth();
  const [requestId] = useState(newRequestId);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expected = session.live.expectedCash;
  const n = Number(counted.replace(/[$,\s]/g, ""));
  const valid = counted.trim() !== "" && Number.isFinite(n) && n >= 0;
  const diff = valid ? formatDifference(cashDifference(n, expected).difference) : null;
  const noteRequired = valid && closeNoteRequired(n, expected);
  const submit = async () => {
    setError(null);
    const parsed = closeCashSchema.safeParse({
      sessionId: session.id,
      version: session.version,
      requestId,
      countedCash: counted,
      notes,
      expectedCash: expected,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    if (!client) return;
    setBusy(true);
    const r = await createCashRepository(client).close(parsed.data);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "40001") onConflict();
      return setError(cashErrorMessage(r.error));
    }
    onDone();
  };
  return (
    <View style={styles.form}>
      <Text style={textStyle("bodySmall")}>
        {cashCopy.expected}: {formatMoney(expected)}
      </Text>
      <Field
        label={cashCopy.countedCash}
        value={counted}
        onChangeText={setCounted}
        keyboardType="decimal-pad"
        hint={diff ? `${cashCopy.difference}: ${diff.text}` : undefined}
        error={errors.countedCash}
      />
      <Field
        label={noteRequired ? cashCopy.closeNotes : `${cashCopy.closeNotes} (opcional)`}
        value={notes}
        onChangeText={setNotes}
        maxLength={500}
        hint={noteRequired ? cashCopy.closeNoteRequired : undefined}
        error={errors.notes}
      />
      <Text style={textStyle("caption", "muted")}>{cashCopy.closeHint}</Text>
      <Notice tone="danger" text={error} />
      <Button label={cashCopy.close} loading={busy} onPress={() => void submit()} />
    </View>
  );
}

/** Reapertura (sólo admin) con motivo. */
function ReopenBox({
  session,
  onDone,
  onConflict,
}: {
  session: CashSession;
  onDone: () => void;
  onConflict: () => void;
}) {
  const { client } = useAuth();
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(null);
    const parsed = reopenCashSchema.safeParse({ sessionId: session.id, version: session.version, reason });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    if (!client) return;
    setBusy(true);
    const r = await createCashRepository(client).reopen(parsed.data);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "40001") onConflict();
      return setError(cashErrorMessage(r.error));
    }
    onDone();
  };
  return (
    <View style={styles.form}>
      <Field
        label={cashCopy.reopenReason}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        error={errors.reason}
      />
      <Text style={textStyle("caption", "muted")}>{cashCopy.reopenHint}</Text>
      <Notice tone="danger" text={error} />
      <Button label={cashCopy.reopen} variant="danger" loading={busy} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  item: { gap: space.xxs, marginBottom: space.sm },
  form: { gap: space.sm },
});
