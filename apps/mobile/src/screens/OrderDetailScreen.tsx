import {
  activeCenterAccess,
  activeRoles,
  canInActiveCenter,
  computeOrderTotals,
  DISCOUNT_LEVEL_LABELS,
  executionCopy,
  formatMoney,
  orderErrorMessage,
  ordersCopy,
  orderStatusActions,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  presentDiscount,
  presentHistory,
  presentOrder,
  previewDiscount,
  utcToZoned,
  type Bay,
  type CatalogItem,
  type OrderMutation,
  type Result,
  type ServiceOrder,
  type Technician,
  type ViewState,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createCatalogRepository,
  createServiceOrderRepository,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import {
  discountFormSchema,
  fieldErrors,
  orderDetailsFormSchema,
  paymentFormSchema,
  setOrderItemSchema,
  setOrderStatusSchema,
  toUpdateOrderDetailsCommand,
  voidDiscountSchema,
} from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import type { FieldErrors, FormValues } from "@/components/ClientFields";
import { ChannelFields } from "@/components/OrderFields";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  order: ServiceOrder;
  services: CatalogItem[];
  bays: Bay[];
  technicians: Technician[];
}

async function fetchOrder(
  client: MeguiarsSupabaseClient,
  id: string,
  centerId: string,
): Promise<ViewState<Loaded>> {
  const result = await createServiceOrderRepository(client).get(id);
  if (!result.ok || result.data.detailCenterId !== centerId)
    return { status: "permission_denied", message: ordersCopy.notFound };
  const agenda = createAgendaRepository(client);
  const [catalog, bays, technicians] = await Promise.all([
    createCatalogRepository(client).listForCenter(centerId),
    agenda.listBays(centerId),
    agenda.listTechnicians(centerId),
  ]);
  return {
    status: "ready",
    data: {
      order: result.data,
      services: catalog.ok ? catalog.data : [],
      bays: bays.ok ? bays.data : [],
      technicians: technicians.ok ? technicians.data : [],
    },
  };
}

/** Ejecuta una edición: éxito o versión vieja recargan la OS; el error queda visible. */
type Mutate = (run: () => Promise<Result<OrderMutation>>) => Promise<string | null>;

/** Detalle y operación de la OS (equivale a /ordenes/[id] en web). */
export function OrderDetailScreen({
  state,
  header,
  orderId,
  onBack,
  onExecution,
}: PrivateScreenProps & { orderId: string; onBack: () => void; onExecution: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchOrder(client, orderId, center.id).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [client, orderId, center.id, version]);

  const mutate: Mutate = async (run) => {
    const result = await run();
    if (!result.ok) {
      if (result.error.code === "40001") reload();
      return orderErrorMessage(result.error);
    }
    toast({ message: ordersCopy.saved, tone: "success" });
    reload();
    return null;
  };

  const back = <LinkButton label={`← ${ordersCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={ordersCopy.folio} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando OS" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }

  const { order } = data.data;
  const view = presentOrder(order);
  const canWrite = canInActiveCenter(state, "orders.write");
  const repo = client ? createServiceOrderRepository(client) : null;
  const lineName = (itemId: string) => order.items.find((i) => i.id === itemId)?.serviceName ?? "—";
  // key = versión: cada formulario se vuelve a montar con la OS vigente.
  const k = `${order.id}-${order.version}`;

  return (
    <Screen title={view.title} description={`${view.subtitle} · ${view.channel}`} header={header}>
      {back}
      <Badge label={view.status} tone={view.tone} />
      <Button label={executionCopy.open} variant="secondary" onPress={onExecution} />
      <View style={styles.kpis}>
        {view.kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} caption={kpi.caption} />
        ))}
      </View>
      {canWrite && repo ? (
        <StatusCard key={`s-${k}`} order={order} roles={activeRoles(state)} mutate={mutate} repo={repo} />
      ) : null}
      <LinesCard
        key={`l-${k}`}
        order={order}
        services={data.data.services}
        editable={canWrite && view.canEditItems}
        needsReason={view.itemsNeedReason}
        mutate={mutate}
        repo={repo}
      />
      <DiscountsCard
        key={`d-${k}`}
        order={order}
        rows={order.discounts.map((d) => presentDiscount(d, lineName))}
        editable={canWrite && view.canDiscount}
        mutate={mutate}
        repo={repo}
      />
      {canWrite && view.canPay && repo ? (
        <PaymentCard key={`p-${k}`} order={order} balance={view.balance} mutate={mutate} repo={repo} />
      ) : null}
      {canWrite && view.canEditDetails && repo ? (
        <DetailsCard
          key={`i-${k}`}
          loaded={data.data}
          canChangeChannel={view.canChangeChannel}
          timeZone={center.timezone}
          mutate={mutate}
          repo={repo}
        />
      ) : (
        <Card title={ordersCopy.detailsTitle}>
          <Text style={textStyle("bodySmall")}>
            {ordersCopy.diagnosisLabel}: {order.diagnosis ?? "—"}
          </Text>
          <Text style={textStyle("bodySmall")}>
            {ordersCopy.recommendationsLabel}: {order.recommendations ?? "—"}
          </Text>
          <Text style={textStyle("bodySmall")}>
            {ordersCopy.nextVisitTitle}: {order.nextVisitOn ?? "—"}
          </Text>
        </Card>
      )}
      <Card title={ordersCopy.historyTitle}>
        <List
          caption={ordersCopy.historyTitle}
          rows={order.history.map((h) => presentHistory(h, center.timezone))}
          rowKey={(h) => h.key}
          emptyMessage="—"
          columns={[
            { key: "when", header: "Fecha", value: (h) => h.when },
            { key: "change", header: ordersCopy.statusFilter, value: (h) => h.change },
            { key: "reason", header: ordersCopy.reasonLabel, value: (h) => h.reason },
          ]}
        />
      </Card>
    </Screen>
  );
}

type Repo = ReturnType<typeof createServiceOrderRepository>;
interface SectionProps {
  order: ServiceOrder;
  mutate: Mutate;
  repo: Repo;
}

function StatusCard({
  order,
  roles,
  mutate,
  repo,
}: SectionProps & { roles: Parameters<typeof orderStatusActions>[1] }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = orderStatusActions(order, roles);
  if (actions.length === 0) return null;

  const apply = async (status: ServiceOrder["status"]) => {
    const parsed = setOrderStatusSchema.safeParse({
      orderId: order.id,
      version: order.version,
      status,
      reason,
    });
    if (!parsed.success) return setError(fieldErrors(parsed.error).reason ?? "Datos inválidos");
    setBusy(true);
    setError(await mutate(() => repo.setStatus(parsed.data)));
    setBusy(false);
  };

  return (
    <Card title={ordersCopy.statusTitle}>
      {actions.some((a) => a.needsReason && !a.blocker) ? (
        <Field
          label={ordersCopy.reasonLabel}
          hint={ordersCopy.statusReasonHint}
          value={reason}
          onChangeText={setReason}
        />
      ) : null}
      {actions.map((a) => (
        <View key={a.to}>
          <Button
            label={a.label}
            variant={a.destructive ? "danger" : "primary"}
            loading={busy}
            disabled={a.blocker !== null}
            onPress={() => void apply(a.to)}
          />
          {a.blocker ? <Text style={textStyle("caption", "muted")}>{a.blocker}</Text> : null}
        </View>
      ))}
      <Notice tone="danger" text={error} />
    </Card>
  );
}

function LinesCard({
  order,
  services,
  editable,
  needsReason,
  mutate,
  repo,
}: Omit<SectionProps, "repo"> & {
  services: CatalogItem[];
  editable: boolean;
  needsReason: boolean;
  repo: Repo | null;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(order.items.map((i) => [i.serviceId, String(i.quantity)])),
  );
  const [newService, setNewService] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inOrder = new Set(order.items.map((i) => i.serviceId));

  const save = async (serviceId: string, quantity: string) => {
    if (!repo) return;
    const parsed = setOrderItemSchema.safeParse({
      orderId: order.id,
      version: order.version,
      serviceId,
      quantity,
      reason,
    });
    if (!parsed.success) {
      const e = fieldErrors(parsed.error);
      return setError(e.quantity ?? e.reason ?? e.serviceId ?? "Datos inválidos");
    }
    setBusy(true);
    setError(await mutate(() => repo.setItem(parsed.data)));
    setBusy(false);
  };

  return (
    <Card title={ordersCopy.linesTitle}>
      {order.items.length === 0 ? (
        <Text style={textStyle("bodySmall", "muted")}>{ordersCopy.noLines}</Text>
      ) : null}
      {order.items.map((i) => (
        <View key={i.id} style={styles.line}>
          <Text style={textStyle("label")}>
            {i.serviceName} · {i.serviceCode} {i.kind === "producto" ? "(producto)" : ""}
          </Text>
          <Text style={textStyle("bodySmall")}>
            {i.quantity} × {formatMoney(i.unitPrice)} = {formatMoney(i.lineSubtotal)}
            {i.lineDiscount > 0 ? ` − ${formatMoney(i.lineDiscount)}` : ""}
          </Text>
          {editable ? (
            <View style={styles.row}>
              <View style={styles.qty}>
                <Field
                  label={ordersCopy.quantity}
                  keyboardType="number-pad"
                  value={quantities[i.serviceId] ?? ""}
                  onChangeText={(v) => setQuantities((q) => ({ ...q, [i.serviceId]: v }))}
                />
              </View>
              <Button
                label={ordersCopy.update}
                variant="secondary"
                size="sm"
                loading={busy}
                onPress={() => void save(i.serviceId, quantities[i.serviceId] ?? "")}
              />
              <Button
                label={ordersCopy.remove}
                variant="danger"
                size="sm"
                loading={busy}
                onPress={() => void save(i.serviceId, "0")}
              />
            </View>
          ) : null}
        </View>
      ))}
      {editable ? (
        <>
          <Select
            label={ordersCopy.itemsLabel}
            placeholder="Elige"
            options={services
              .filter((s) => !inOrder.has(s.id))
              .map((s) => ({ value: s.id, label: `${s.name} · ${formatMoney(s.price)}` }))}
            value={newService}
            onChange={setNewService}
          />
          <Field
            label={ordersCopy.quantity}
            keyboardType="number-pad"
            value={newQuantity}
            onChangeText={setNewQuantity}
          />
          {needsReason ? (
            <Field
              label={ordersCopy.reasonLabel}
              hint={ordersCopy.lineReasonHint}
              required
              value={reason}
              onChangeText={setReason}
            />
          ) : null}
          <Button
            label={ordersCopy.addLine}
            loading={busy}
            onPress={() => void save(newService, newQuantity)}
          />
        </>
      ) : null}
      <Text style={textStyle("caption", "muted")}>
        {ordersCopy.frozenHint} {ordersCopy.taxHint}
      </Text>
      <Notice tone="danger" text={error} />
    </Card>
  );
}

function DiscountsCard({
  order,
  rows,
  editable,
  mutate,
  repo,
}: Omit<SectionProps, "repo"> & {
  rows: ReturnType<typeof presentDiscount>[];
  editable: boolean;
  repo: Repo | null;
}) {
  const [values, setValues] = useState<FormValues>({ itemId: "", kind: "percent", value: "", reason: "" });
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const totals = computeOrderTotals(
    order.items,
    order.discounts.map((d) => ({
      itemId: d.itemId,
      kind: d.kind,
      value: d.value,
      voided: d.voidedAt !== null,
    })),
  );
  const amount = Number((values.value ?? "").replace(/[$,\s]/g, ""));
  const preview =
    Number.isFinite(amount) && amount > 0
      ? previewDiscount(totals, order.paidAmount, {
          itemId: values.itemId || null,
          kind: values.kind as "percent" | "amount",
          value: amount,
        })
      : null;

  const add = async () => {
    if (!repo) return;
    const parsed = discountFormSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    setError(
      await mutate(() => repo.addDiscount({ ...parsed.data, orderId: order.id, version: order.version })),
    );
    setBusy(false);
  };

  const voidOne = async (discountId: string) => {
    if (!repo) return;
    const parsed = voidDiscountSchema.safeParse({
      orderId: order.id,
      version: order.version,
      discountId,
      reason: voidReasons[discountId] ?? "",
    });
    if (!parsed.success) return setError(fieldErrors(parsed.error).reason ?? "Datos inválidos");
    setBusy(true);
    setError(await mutate(() => repo.voidDiscount(parsed.data)));
    setBusy(false);
  };

  return (
    <Card title={ordersCopy.discountsTitle}>
      {rows.map((d) => (
        <View key={d.id} style={styles.line}>
          <Text style={textStyle("bodySmall", d.active ? undefined : "muted")}>
            {d.target} · {d.value} = {d.amount}
          </Text>
          <Text style={textStyle("caption", "muted")}>
            {d.reason} · {ordersCopy.discountLevel}: {d.level}
          </Text>
          {editable && d.active ? (
            <>
              <Field
                label={ordersCopy.reasonLabel}
                value={voidReasons[d.id] ?? ""}
                onChangeText={(v) => setVoidReasons((r) => ({ ...r, [d.id]: v }))}
              />
              <Button
                label={ordersCopy.voidDiscount}
                variant="danger"
                size="sm"
                loading={busy}
                onPress={() => void voidOne(d.id)}
              />
            </>
          ) : null}
        </View>
      ))}
      {editable ? (
        <>
          <Select
            label={ordersCopy.discountTarget}
            options={[
              { value: "", label: ordersCopy.wholeOrder },
              ...order.items.map((i) => ({ value: i.id, label: i.serviceName })),
            ]}
            value={values.itemId ?? ""}
            onChange={(v) => set("itemId", v)}
          />
          <Select
            label={ordersCopy.discountKind}
            options={[
              { value: "percent", label: ordersCopy.percent },
              { value: "amount", label: ordersCopy.amount },
            ]}
            value={values.kind ?? "percent"}
            onChange={(v) => set("kind", v)}
          />
          <Field
            label={ordersCopy.discountValue}
            keyboardType="decimal-pad"
            value={values.value ?? ""}
            onChangeText={(v) => set("value", v)}
            error={errors.value}
            hint={
              preview
                ? `${formatMoney(preview.amount)} · acumulado ${preview.percentAfter}% · ${ordersCopy.discountLevel}: ${DISCOUNT_LEVEL_LABELS[preview.requiredLevel]}`
                : undefined
            }
          />
          <Field
            label={ordersCopy.reasonLabel}
            required
            value={values.reason ?? ""}
            onChangeText={(v) => set("reason", v)}
            error={errors.reason}
          />
          <Notice tone="danger" text={preview?.error} />
          <Button
            label={ordersCopy.addDiscount}
            variant="secondary"
            loading={busy}
            onPress={() => void add()}
          />
        </>
      ) : null}
      <Notice tone="danger" text={error} />
    </Card>
  );
}

function PaymentCard({ order, balance, mutate, repo }: SectionProps & { balance: number }) {
  const [values, setValues] = useState<FormValues>({ amount: balance.toFixed(2), method: "", reference: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    const parsed = paymentFormSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    setError(
      await mutate(() => repo.recordPayment({ ...parsed.data, orderId: order.id, version: order.version })),
    );
    setBusy(false);
  };

  return (
    <Card title={ordersCopy.paymentTitle} subtitle={ordersCopy.paymentHint}>
      <Field
        label={ordersCopy.paymentAmount}
        keyboardType="decimal-pad"
        value={values.amount ?? ""}
        onChangeText={(v) => set("amount", v)}
        error={errors.amount}
      />
      <Select
        label={ordersCopy.paymentMethod}
        placeholder="Elige"
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
        value={values.method ?? ""}
        onChange={(v) => set("method", v)}
        error={errors.method}
      />
      <Field
        label={ordersCopy.paymentReference}
        value={values.reference ?? ""}
        onChangeText={(v) => set("reference", v)}
      />
      <Notice tone="danger" text={error} />
      <Button label={ordersCopy.recordPayment} loading={busy} onPress={() => void submit()} />
    </Card>
  );
}

function DetailsCard({
  loaded,
  canChangeChannel,
  timeZone,
  mutate,
  repo,
}: Omit<SectionProps, "order"> & { loaded: Loaded; canChangeChannel: boolean; timeZone: string }) {
  const o = loaded.order;
  const promised = o.promisedAt ? utcToZoned(o.promisedAt, timeZone) : null;
  const [values, setValues] = useState<FormValues>({
    channel: o.channel,
    channelReference: o.channelReference ?? "",
    bayId: o.bayId ?? "",
    technicianId: o.technicianId ?? "",
    odometerKm: o.odometerKm === null ? "" : String(o.odometerKm),
    promisedDate: promised?.date ?? "",
    promisedTime: promised?.time ?? "",
    observations: o.observations ?? "",
    diagnosis: o.diagnosis ?? "",
    recommendations: o.recommendations ?? "",
    nextVisitOn: o.nextVisitOn ?? "",
    nextVisitServiceId: o.nextVisitServiceId ?? "",
    nextVisitNotes: o.nextVisitNotes ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const none = { value: "", label: ordersCopy.none };

  const submit = async () => {
    const parsed = orderDetailsFormSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    setError(
      await mutate(() =>
        repo.updateDetails(
          toUpdateOrderDetailsCommand(parsed.data, { orderId: o.id, version: o.version, timeZone }),
        ),
      ),
    );
    setBusy(false);
  };

  const text = (key: string, label: string, extra: Partial<Parameters<typeof Field>[0]> = {}) => (
    <Field
      label={label}
      value={values[key] ?? ""}
      onChangeText={(v) => set(key, v)}
      error={errors[key]}
      {...extra}
    />
  );

  return (
    <Card title={ordersCopy.detailsTitle}>
      {canChangeChannel ? <ChannelFields values={values} errors={errors} set={set} /> : null}
      <Select
        label={ordersCopy.bayLabel}
        options={[
          none,
          ...loaded.bays
            .filter((b) => b.active || b.id === o.bayId)
            .map((b) => ({ value: b.id, label: b.name })),
        ]}
        value={values.bayId ?? ""}
        onChange={(v) => set("bayId", v)}
      />
      <Select
        label={ordersCopy.technicianLabel}
        options={[
          none,
          ...loaded.technicians
            .filter((t) => t.active || t.id === o.technicianId)
            .map((t) => ({ value: t.id, label: t.fullName })),
        ]}
        value={values.technicianId ?? ""}
        onChange={(v) => set("technicianId", v)}
      />
      {text("odometerKm", ordersCopy.odometerLabel, { keyboardType: "number-pad" })}
      {text("promisedDate", `${ordersCopy.promisedDate} (AAAA-MM-DD)`, {
        keyboardType: "numbers-and-punctuation",
      })}
      {text("promisedTime", `${ordersCopy.promisedTime} (HH:MM)`, {
        keyboardType: "numbers-and-punctuation",
      })}
      {text("observations", ordersCopy.observationsLabel)}
      {text("diagnosis", ordersCopy.diagnosisLabel)}
      {text("recommendations", ordersCopy.recommendationsLabel)}
      <Text style={textStyle("label")}>{ordersCopy.nextVisitTitle}</Text>
      {text("nextVisitOn", `${ordersCopy.nextVisitDate} (AAAA-MM-DD)`, {
        keyboardType: "numbers-and-punctuation",
      })}
      <Select
        label={ordersCopy.nextVisitService}
        options={[none, ...loaded.services.map((s) => ({ value: s.id, label: s.name }))]}
        value={values.nextVisitServiceId ?? ""}
        onChange={(v) => set("nextVisitServiceId", v)}
      />
      {text("nextVisitNotes", ordersCopy.nextVisitNotes)}
      <Notice tone="danger" text={error} />
      <Button
        label={ordersCopy.submitDetails}
        variant="secondary"
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  line: { gap: space.xs, paddingVertical: space.sm },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, flexWrap: "wrap" },
  qty: { width: space.xxxl * 2 },
});
