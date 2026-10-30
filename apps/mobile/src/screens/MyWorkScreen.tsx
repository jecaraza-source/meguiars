import {
  activeCenterAccess,
  addDays,
  myWorkSummary,
  EVIDENCE_KIND_LABELS,
  formatTimeInCenterTimeZone,
  ITEM_WORK_LABELS,
  ITEM_WORK_TONES,
  MY_WORK_COPY,
  MY_WORK_STATE_LABELS,
  MY_WORK_STATE_TONES,
  newRequestId,
  nextActionOf,
  orderProgress,
  orderStateOf,
  finishedLabel,
  orderTimeLabel,
  presentMyWorkWeek,
  sortOrders,
  todayIn,
  vehicleLabel,
  type EvidenceKind,
  type MyWorkDay,
  type MyWorkItem,
  type MyWorkOrder,
  type MyWorkWeek,
} from "@meguiars/domain";
import { createMyWorkRepository } from "@meguiars/supabase";
import { colors, radius, space } from "@meguiars/ui-tokens";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { capturePhoto } from "@/lib/photo";
import { Button, Field } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { Sheet, useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

type Writing = { kind: "comment" | "problem"; order: MyWorkOrder } | null;

/**
 * «Mi día» del técnico / lavador (equivale a /mi-dia): sus asignaciones con
 * botones grandes. Empezar y Trabajo terminado por servicio; fotos antes y
 * después con la cámara; comentario y reportar problema. Lo pendiente arriba, lo
 * terminado en una lista corta, y «Mi semana» con su pago (lunes–domingo).
 */
export function MyWorkScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const repo = useMemo(() => (client ? createMyWorkRepository(client) : null), [client]);
  const today = todayIn(center.timezone);
  const [day, setDay] = useState(today);
  // «week» muestra Mi semana; weekDay es un día de la semana a mostrar (hoy o hace 7 días).
  const [view, setView] = useState<"day" | "week">("day");
  const [weekDay, setWeekDay] = useState(today);
  const [week, setWeek] = useState<MyWorkWeek | null>(null);
  const [data, setData] = useState<MyWorkDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [writing, setWriting] = useState<Writing>(null);
  const [text, setText] = useState("");

  // Cambiar `reload` vuelve a pedir el día (tras cada acción o con «Actualizar»).
  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);

  useEffect(() => {
    if (!repo) return;
    let active = true;
    void repo.get(center.id, day).then((result) => {
      if (!active) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setData(null);
        setError(result.error.kind === "permission_denied" ? MY_WORK_COPY.notLinked : result.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [repo, center.id, day, reload]);

  useEffect(() => {
    if (!repo || view !== "week") return;
    let active = true;
    void repo.week(center.id, weekDay).then((result) => {
      if (!active) return;
      if (result.ok) {
        setWeek(result.data);
        setError(null);
      } else {
        setWeek(null);
        setError(result.error.kind === "permission_denied" ? MY_WORK_COPY.notLinked : result.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [repo, center.id, view, weekDay, reload]);

  /** Ejecuta una acción, avisa y recarga el día. */
  const act = async (key: string, run: () => Promise<{ ok: boolean; message?: string }>, success: string) => {
    setBusy(key);
    const result = await run();
    setBusy(null);
    if (result.ok) toast({ message: success, tone: "success" });
    else toast({ message: result.message ?? "No se pudo guardar", tone: "danger" });
    load();
    return result.ok;
  };

  const start = (item: MyWorkItem) =>
    act(
      `start:${item.id}`,
      async () => {
        const r = await repo!.start(item.id);
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      },
      `${item.name}: empezado`,
    );

  const done = (item: MyWorkItem) =>
    act(
      `done:${item.id}`,
      async () => {
        const r = await repo!.done(item.id);
        if (!r.ok) return { ok: false, message: r.error.message };
        if (r.data.orderFinished) toast({ message: MY_WORK_COPY.finished, tone: "success" });
        return { ok: true };
      },
      `${item.name}: trabajo realizado`,
    );

  const photo = async (order: MyWorkOrder, kind: EvidenceKind) => {
    const key = `photo:${order.id}:${kind}`;
    setBusy(key);
    const captured = await capturePhoto("camera");
    setBusy(null);
    if (!captured.ok) {
      if (!captured.canceled) toast({ message: captured.message, tone: "danger" });
      return;
    }
    const p = captured.photo;
    // Un fileId por foto: un reintento repite la ruta y el registro es idempotente.
    const fileId = newRequestId();
    await act(
      key,
      async () => {
        const r = await repo!.uploadPhoto({
          order,
          fileId,
          file: p.data,
          contentType: "image/jpeg",
          sizeBytes: p.sizeBytes,
          width: p.width,
          height: p.height,
          kind,
        });
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      },
      `Foto ${EVIDENCE_KIND_LABELS[kind].toLowerCase()} guardada`,
    );
  };

  const send = async () => {
    if (!writing) return;
    const { kind, order } = writing;
    const ok = await act(
      `write:${order.id}`,
      async () => {
        const r =
          kind === "comment"
            ? await repo!.comment(order.id, text)
            : await repo!.reportProblem(order.id, text);
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      },
      kind === "comment" ? "Comentario guardado" : "Problema reportado a recepción",
    );
    if (ok) {
      setWriting(null);
      setText("");
    }
  };

  const orders = data ? sortOrders(data.orders) : [];
  const pending = orders.filter((o) => orderStateOf(o) !== "terminada");
  const finished = orders.filter((o) => orderStateOf(o) === "terminada");
  const weekView = week ? presentMyWorkWeek(week, center.timezone) : null;
  return (
    <Screen
      title={view === "week" ? MY_WORK_COPY.week : MY_WORK_COPY.title}
      description={view === "week" ? weekView?.range : data ? myWorkSummary(data) : undefined}
      header={header}
    >
      {subnav}
      <View style={styles.row}>
        <View style={styles.grow}>
          <Button
            label={MY_WORK_COPY.today}
            variant={view === "day" && day === today ? "primary" : "secondary"}
            onPress={() => {
              setView("day");
              setDay(today);
            }}
          />
        </View>
        <View style={styles.grow}>
          <Button
            label={MY_WORK_COPY.tomorrow}
            variant={view === "day" && day !== today ? "primary" : "secondary"}
            onPress={() => {
              setView("day");
              setDay(addDays(today, 1));
            }}
          />
        </View>
        <View style={styles.grow}>
          <Button
            label={MY_WORK_COPY.week}
            variant={view === "week" ? "primary" : "secondary"}
            onPress={() => {
              setView("week");
              setWeekDay(today);
            }}
          />
        </View>
      </View>

      {error ? <Notice text={error} tone="warning" /> : null}
      <Button label={MY_WORK_COPY.refresh} variant="ghost" onPress={load} />

      {view === "week" ? (
        <>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button
                label={MY_WORK_COPY.thisWeek}
                variant={weekDay === today ? "primary" : "ghost"}
                onPress={() => setWeekDay(today)}
              />
            </View>
            <View style={styles.grow}>
              <Button
                label={MY_WORK_COPY.lastWeek}
                variant={weekDay !== today ? "primary" : "ghost"}
                onPress={() => setWeekDay(addDays(today, -7))}
              />
            </View>
          </View>
          {weekView === null && !error ? <Skeleton lines={5} /> : null}
          {weekView ? (
            <Card title={`${MY_WORK_COPY.weekTotal}: ${weekView.total}`} subtitle={weekView.payDay}>
              <Text style={textStyle("bodySmall", "muted")}>
                {weekView.count} {weekView.count === 1 ? "trabajo terminado" : "trabajos terminados"}
              </Text>
            </Card>
          ) : null}
          {weekView && weekView.count === 0 ? <EmptyState title={MY_WORK_COPY.weekEmpty} /> : null}
          {weekView?.days
            .filter((d) => d.count > 0)
            .map((d) => (
              <Card key={d.date} title={`${d.label}${d.isToday ? " · hoy" : ""}`} subtitle={d.subtotal}>
                {d.items.map((it) => (
                  <View key={it.id} style={styles.service}>
                    <View style={styles.row}>
                      <Text style={[textStyle("label"), styles.grow]}>{it.title}</Text>
                      <Text style={textStyle("label")}>{it.pay}</Text>
                    </View>
                    <Text style={textStyle("caption", "muted")}>{it.detail}</Text>
                  </View>
                ))}
              </Card>
            ))}
        </>
      ) : null}

      {view === "day" && data === null && !error ? <Skeleton lines={5} /> : null}
      {view === "day" && data && orders.length === 0 && data.appointments.length === 0 ? (
        <EmptyState title={MY_WORK_COPY.emptyDay} />
      ) : null}

      {view === "day" && finished.length > 0 ? (
        <Card title={`${MY_WORK_COPY.finishedToday} (${finished.length})`}>
          {finished.map((order) => (
            <View key={order.id} style={styles.service}>
              <Text style={textStyle("label")}>{vehicleLabel(order.vehicle)}</Text>
              <Text style={textStyle("caption", "muted")}>
                {[
                  order.items.map((i) => i.name).join(", "),
                  finishedLabel(order, center.timezone),
                  order.folio,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {order.status === "terminada" ? (
                <Button
                  label={MY_WORK_COPY.photoAfter}
                  variant="secondary"
                  loading={busy === `photo:${order.id}:despues`}
                  disabled={busy !== null}
                  onPress={() => void photo(order, "despues")}
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {(view === "day" ? pending : []).map((order) => {
        const state = orderStateOf(order);
        const progress = orderProgress(order);
        const closed = state === "terminada";
        return (
          <Card
            key={order.id}
            title={vehicleLabel(order.vehicle)}
            subtitle={[orderTimeLabel(order, center.timezone), order.bay, order.folio]
              .filter(Boolean)
              .join(" · ")}
          >
            <View style={styles.row}>
              <Badge label={MY_WORK_STATE_LABELS[state]} tone={MY_WORK_STATE_TONES[state]} />
              <Text style={textStyle("caption", "muted")}>
                {progress.done} de {progress.total} servicios
              </Text>
              {order.openProblems > 0 ? (
                <Badge label={`${MY_WORK_COPY.openProblems}: ${order.openProblems}`} tone="danger" />
              ) : null}
            </View>
            {order.observations ? (
              <View style={styles.instructions}>
                <Text style={textStyle("label")}>{MY_WORK_COPY.instructions}</Text>
                <Text style={textStyle("body")}>{order.observations}</Text>
              </View>
            ) : null}

            {order.items.map((item) => {
              const action = nextActionOf(item);
              return (
                <View key={item.id} style={styles.service}>
                  <View style={styles.row}>
                    <Text style={[textStyle("heading"), styles.grow]}>
                      {item.quantity > 1 ? `${item.quantity} × ` : ""}
                      {item.name}
                    </Text>
                    <Badge label={ITEM_WORK_LABELS[item.status]} tone={ITEM_WORK_TONES[item.status]} />
                  </View>
                  {action === "start" && !closed ? (
                    <Button
                      label={MY_WORK_COPY.start}
                      variant="secondary"
                      loading={busy === `start:${item.id}`}
                      disabled={busy !== null}
                      onPress={() => void start(item)}
                    />
                  ) : null}
                  {action !== null && !closed ? (
                    <Button
                      label={MY_WORK_COPY.done}
                      loading={busy === `done:${item.id}`}
                      disabled={busy !== null}
                      onPress={() => void done(item)}
                    />
                  ) : null}
                </View>
              );
            })}

            {!closed || order.status === "terminada" ? (
              <View style={styles.row}>
                {(["antes", "despues"] as const).map((kind) => (
                  <View key={kind} style={styles.grow}>
                    <Button
                      label={kind === "antes" ? MY_WORK_COPY.photoBefore : MY_WORK_COPY.photoAfter}
                      variant="secondary"
                      loading={busy === `photo:${order.id}:${kind}`}
                      disabled={busy !== null}
                      onPress={() => void photo(order, kind)}
                    />
                  </View>
                ))}
              </View>
            ) : null}
            {order.photos.length > 0 ? (
              <View style={styles.thumbs}>
                {order.photos.map((p) =>
                  p.url ? (
                    <Image
                      key={p.id}
                      source={{ uri: p.url }}
                      style={styles.thumb}
                      accessibilityLabel={`Foto ${EVIDENCE_KIND_LABELS[p.kind]}`}
                    />
                  ) : (
                    <View key={p.id} style={[styles.thumb, styles.thumbEmpty]}>
                      <Text style={textStyle("caption", "muted")}>{EVIDENCE_KIND_LABELS[p.kind]}</Text>
                    </View>
                  ),
                )}
              </View>
            ) : null}

            {order.comments.length > 0 ? (
              <View style={styles.stack}>
                <Text style={textStyle("label")}>{MY_WORK_COPY.comments}</Text>
                {order.comments.map((c, i) => (
                  <Text key={`${c.at}-${i}`} style={textStyle("bodySmall")}>
                    {formatTimeInCenterTimeZone(c.at, center.timezone)}
                    {c.by ? ` · ${c.by}` : ""}: {c.note}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={styles.grow}>
                <Button
                  label={MY_WORK_COPY.comment}
                  variant="ghost"
                  disabled={busy !== null}
                  onPress={() => {
                    setText("");
                    setWriting({ kind: "comment", order });
                  }}
                />
              </View>
              {!closed ? (
                <View style={styles.grow}>
                  <Button
                    label={MY_WORK_COPY.problem}
                    variant="ghost"
                    disabled={busy !== null}
                    onPress={() => {
                      setText("");
                      setWriting({ kind: "problem", order });
                    }}
                  />
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}

      {(view === "day" ? (data?.appointments ?? []) : []).map((a) => (
        <Card
          key={a.id}
          title={vehicleLabel(a.vehicle)}
          subtitle={[formatTimeInCenterTimeZone(a.startsAt, center.timezone), a.bay]
            .filter(Boolean)
            .join(" · ")}
        >
          <Badge label={MY_WORK_COPY.waitingCar} tone="info" />
          {a.services.length > 0 ? <Text style={textStyle("body")}>{a.services.join(", ")}</Text> : null}
          {a.notes ? <Text style={textStyle("bodySmall", "muted")}>{a.notes}</Text> : null}
        </Card>
      ))}

      <Sheet
        open={writing !== null}
        title={writing?.kind === "problem" ? MY_WORK_COPY.problem : MY_WORK_COPY.comment}
        onClose={() => setWriting(null)}
      >
        {writing ? (
          <Text style={textStyle("bodySmall", "muted")}>{vehicleLabel(writing.order.vehicle)}</Text>
        ) : null}
        <Field
          label={writing?.kind === "problem" ? "¿Qué pasó?" : "Comentario"}
          hint={
            writing?.kind === "problem"
              ? "Rayón previo, pieza dañada, falta de insumo… Recepción lo ve de inmediato."
              : undefined
          }
          value={text}
          onChangeText={setText}
          multiline
        />
        <Button
          label={writing?.kind === "problem" ? "Reportar" : "Guardar comentario"}
          loading={busy?.startsWith("write:") ?? false}
          disabled={text.trim() === ""}
          onPress={() => void send()}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  grow: { flexGrow: 1, flexBasis: 0, minWidth: 120 },
  instructions: {
    gap: space.xxs,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSurface,
  },
  service: {
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbEmpty: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
});
