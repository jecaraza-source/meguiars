import {
  activeCenterAccess,
  can,
  canInActiveCenter,
  CASH_RANGE_LABELS,
  CASH_RANGES,
  CASH_SHIFT_LABELS,
  CASH_SHIFTS,
  cashCopy,
  cashErrorMessage,
  cashRange,
  formatDateOnly,
  formatMoney,
  newRequestId,
  presentCashRow,
  todayIn,
  usableCenters,
  type CashRangeKey,
  type CashSessionListItem,
  type CashUncovered,
  type ViewState,
} from "@meguiars/domain";
import { createCashRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { fieldErrors, openCashSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  rows: CashSessionListItem[];
  uncovered: CashUncovered[];
  open: CashSessionListItem | undefined;
  lastFloat: number;
}

/** Cortes de caja (equivale a /finanzas/caja en web). */
export function CashSessionsScreen({
  state,
  header,
  subnav,
  onOpen,
}: PrivateScreenProps & { onOpen: (id: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [range, setRange] = useState<CashRangeKey>("7");
  const [all, setAll] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [loaded, setLoaded] = useState<{ key: string; view: ViewState<Loaded> } | null>(null);
  const queryKey = JSON.stringify({ range, all, center: center.id, version });
  const data: ViewState<Loaded> = loaded?.key === queryKey ? loaded.view : { status: "loading" };
  const canOperate = canInActiveCenter(state, "cash.operate");

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all
      ? usableCenters(state.access)
          .filter((a) => can([...a.roles, ...a.corporateRoles], "cash.read"))
          .map((a) => a.center.id)
      : [center.id];
    const { from, to } = cashRange(range, today);
    const repo = createCashRepository(client);
    void Promise.all([
      repo.list(centers, from, to),
      repo.uncovered(centers, from, to),
      // Caja abierta del centro activo (puede venir de un día anterior).
      repo.list([center.id], "2000-01-01", today),
    ]).then(([l, u, c]) => {
      if (!active) return;
      setLoaded({
        key: queryKey,
        view: l.ok
          ? {
              status: "ready",
              data: {
                rows: l.data,
                uncovered: u.ok ? u.data : [],
                open: c.ok ? c.data.find((s) => s.status === "abierta") : undefined,
                lastFloat: c.ok ? (c.data[0]?.openingFloat ?? 0) : 0,
              },
            }
          : { status: "error", message: cashErrorMessage(l.error) },
      });
    });
    return () => {
      active = false;
    };
  }, [client, range, all, center.id, today, state.access, queryKey]);

  const names = new Map(usableCenters(state.access).map((a) => [a.center.id, a.center.name]));

  return (
    <Screen title={cashCopy.title} description={cashCopy.description} header={header}>
      {subnav}
      {data.status === "loading" ? <Skeleton lines={5} label="Cargando cortes" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          <Card title={`${cashCopy.openNow} · ${center.name}`}>
            {data.data.open ? (
              <>
                <LinkButton
                  label={`${data.data.open.folio} · ${presentCashRow(data.data.open).shift}`}
                  onPress={() => onOpen(data.data.open!.id)}
                />
                <Text style={textStyle("bodySmall")}>
                  {cashCopy.expected}: {formatMoney(data.data.open.expectedCash)}
                </Text>
                {canOperate ? (
                  <Button
                    label={cashCopy.close}
                    variant="secondary"
                    onPress={() => onOpen(data.data.open!.id)}
                  />
                ) : null}
              </>
            ) : canOperate ? (
              <OpenCashBox
                key={queryKey}
                detailCenterId={center.id}
                defaultFloat={data.data.lastFloat}
                onOpened={onOpen}
                onConflict={reload}
              />
            ) : (
              <EmptyState title={cashCopy.noOpen} />
            )}
          </Card>
          {data.data.uncovered.length > 0 ? (
            <Card title={cashCopy.uncovered} subtitle={cashCopy.uncoveredHint}>
              {data.data.uncovered.map((u) => (
                <Notice
                  key={`${u.detailCenterId}-${u.day}`}
                  tone="warning"
                  text={`${names.get(u.detailCenterId) ?? ""} · ${formatDateOnly(u.day)} · ${formatMoney(u.cashAmount)} (${u.paymentsCount} ${cashCopy.payments.toLowerCase()})`}
                />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
      <Card
        title={cashCopy.title}
        subtitle={`${CASH_RANGE_LABELS[range]} · ${all ? cashCopy.scopeAll : center.name}`}
      >
        <Select
          label="Periodo"
          options={CASH_RANGES.map((r) => ({ value: r, label: CASH_RANGE_LABELS[r] }))}
          value={range}
          onChange={(v) => setRange(v as CashRangeKey)}
        />
        <LinkButton
          label={all ? cashCopy.scopeCenter : cashCopy.scopeAll}
          onPress={() => setAll((v) => !v)}
        />
        {data.status === "ready" && data.data.rows.length === 0 ? (
          <EmptyState title={cashCopy.empty} />
        ) : null}
        {data.status === "ready"
          ? data.data.rows.map((s) => {
              const r = presentCashRow(s);
              return (
                <View key={s.id} style={styles.item}>
                  <LinkButton label={`${r.folio} · ${r.day} · ${r.shift}`} onPress={() => onOpen(s.id)} />
                  <Badge label={r.status} tone={r.statusTone} />
                  <Text style={textStyle("bodySmall")}>
                    {all ? `${names.get(s.detailCenterId) ?? ""} · ` : ""}
                    {cashCopy.expected} {r.expected} · {cashCopy.counted} {r.counted} · {r.difference}
                  </Text>
                  <Text style={textStyle("caption", "muted")}>
                    {cashCopy.card} {r.card} · {cashCopy.transfer} {r.transfer}
                    {r.versions ? ` · ${r.versions}` : ""}
                  </Text>
                </View>
              );
            })
          : null}
      </Card>
    </Screen>
  );
}

/** Apertura de caja del turno (mismas reglas y textos que la web). */
function OpenCashBox({
  detailCenterId,
  defaultFloat,
  onOpened,
  onConflict,
}: {
  detailCenterId: string;
  defaultFloat: number;
  onOpened: (id: string) => void;
  onConflict: () => void;
}) {
  const { client } = useAuth();
  const [requestId] = useState(newRequestId);
  const [shift, setShift] = useState("unico");
  const [openingFloat, setOpeningFloat] = useState(String(defaultFloat));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(null);
    const parsed = openCashSchema.safeParse({ detailCenterId, requestId, shift, openingFloat, notes });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    if (!client) return;
    setBusy(true);
    const r = await createCashRepository(client).open(parsed.data);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "MG002") onConflict();
      return setError(cashErrorMessage(r.error));
    }
    onOpened(r.data.id);
  };
  return (
    <View style={styles.form}>
      <Select
        label={cashCopy.shift}
        options={CASH_SHIFTS.map((s) => ({ value: s, label: CASH_SHIFT_LABELS[s] }))}
        value={shift}
        onChange={setShift}
        error={errors.shift}
      />
      <Field
        label={cashCopy.openingFloat}
        value={openingFloat}
        onChangeText={setOpeningFloat}
        keyboardType="decimal-pad"
        error={errors.openingFloat}
      />
      <Field
        label={cashCopy.openNotes}
        value={notes}
        onChangeText={setNotes}
        maxLength={500}
        error={errors.notes}
      />
      <Text style={textStyle("caption", "muted")}>
        {cashCopy.openHint} {cashCopy.onlineOnly}
      </Text>
      <Notice tone="danger" text={error} />
      <Button label={cashCopy.open} loading={busy} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  item: { gap: space.xxs, marginBottom: space.sm },
  form: { gap: space.sm },
});
