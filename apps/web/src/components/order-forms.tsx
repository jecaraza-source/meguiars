"use client";

import {
  CHANNEL_REFERENCE_LABELS,
  computeOrderTotals,
  DISCOUNT_LEVEL_LABELS,
  formatDuration,
  formatMoney,
  ordersCopy,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  membershipDiscountTotal,
  previewDiscount,
  SALES_CHANNEL_LABELS,
  SALES_CHANNELS,
  type Bay,
  type CatalogItem,
  type OrderStatusAction,
  type SalesChannel,
  type ServiceOrder,
  type Technician,
  type Vehicle,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addDiscountAction,
  createFromAppointmentAction,
  createOrderAction,
  recordPaymentAction,
  setItemAction,
  setOrderStatusAction,
  updateDetailsAction,
  voidDiscountAction,
  type OrderFormState,
} from "@/app/actions/orders";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({
  label,
  variant,
  name,
  value,
  disabled,
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      label={label}
      loading={pending}
      variant={variant}
      name={name}
      value={value}
      disabled={disabled}
    />
  );
}

function Alert({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {text}
    </p>
  );
}

const valueOf = (state: OrderFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: OrderFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

const noneOption = { value: "", label: ordersCopy.none };
const channelOptions = SALES_CHANNELS.map((c) => ({ value: c, label: SALES_CHANNEL_LABELS[c] }));

/** Campos ocultos de toda edición: la OS y la versión leída (concurrencia). */
function Versioned({ order }: { order: ServiceOrder }) {
  return (
    <>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="version" value={order.version} />
    </>
  );
}

function ChannelFields({
  state,
  initial,
}: {
  state: OrderFormState;
  initial: { channel: SalesChannel; reference: string };
}) {
  const [channel, setChannel] = useState<SalesChannel>(
    (valueOf(state, "channel", initial.channel) as SalesChannel) || "b2c",
  );
  return (
    <div className="grid gap-lg md:grid-cols-2">
      <Select
        name="channel"
        label={ordersCopy.channelLabel}
        options={channelOptions}
        value={channel}
        onChange={(e) => setChannel(e.target.value as SalesChannel)}
        error={state.fields?.channel}
      />
      <Input
        name="channelReference"
        label={CHANNEL_REFERENCE_LABELS[channel]}
        defaultValue={valueOf(state, "channelReference", initial.reference)}
        error={state.fields?.channelReference}
      />
    </div>
  );
}

/** OS walk-in: vehículo, canal, líneas con cantidad, recursos y recepción. */
export function NewOrderForm({
  requestId,
  clientId,
  vehicles,
  services,
  bays,
  technicians,
}: {
  requestId: string;
  clientId: string;
  vehicles: Vehicle[];
  services: CatalogItem[];
  bays: Bay[];
  technicians: Technician[];
}) {
  const [state, action] = useActionState(createOrderAction, {});
  const f = state.fields ?? {};
  const active = vehicles.filter((v) => v.active);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      {/* Misma llave en reintentos: la base no abre dos veces la misma OS. */}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="clientId" value={clientId} />
      <Select
        name="vehicleId"
        label={ordersCopy.vehicleLabel}
        required
        placeholder="Elige el vehículo"
        options={active.map((v) => ({ value: v.id, label: `${v.make} ${v.model} ${v.year} · ${v.plate}` }))}
        defaultValue={valueOf(state, "vehicleId", active.length === 1 ? active[0]!.id : "")}
        error={f.vehicleId}
      />
      <ChannelFields state={state} initial={{ channel: "b2c", reference: "" }} />
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">{ordersCopy.itemsLabel} *</legend>
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-sm">
            <label htmlFor={`qty-${s.id}`} className="text-sm">
              {s.name} · {formatDuration(s.standardDurationMinutes)} · {formatMoney(s.price)}
            </label>
            <input
              id={`qty-${s.id}`}
              name={`qty:${s.id}`}
              inputMode="numeric"
              aria-label={`${ordersCopy.quantity}: ${s.name}`}
              placeholder="0"
              size={3}
              className="mg-input text-right"
              defaultValue={valueOf(state, `qty:${s.id}`)}
            />
          </div>
        ))}
        {f.lines ? (
          <span className="mg-error" role="alert">
            {f.lines}
          </span>
        ) : null}
      </fieldset>
      <div className="grid gap-lg md:grid-cols-3">
        <Select
          name="bayId"
          label={ordersCopy.bayLabel}
          options={[noneOption, ...bays.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]}
          defaultValue={valueOf(state, "bayId")}
        />
        <Select
          name="technicianId"
          label={ordersCopy.technicianLabel}
          options={[
            noneOption,
            ...technicians.filter((t) => t.active).map((t) => ({ value: t.id, label: t.fullName })),
          ]}
          defaultValue={valueOf(state, "technicianId")}
        />
        <Input
          name="odometerKm"
          label={ordersCopy.odometerLabel}
          inputMode="numeric"
          defaultValue={valueOf(state, "odometerKm")}
          error={f.odometerKm}
        />
      </div>
      <div className="grid gap-lg md:grid-cols-2">
        <Input
          name="promisedDate"
          type="date"
          label={ordersCopy.promisedDate}
          defaultValue={valueOf(state, "promisedDate")}
          error={f.promisedDate}
        />
        <Input
          name="promisedTime"
          type="time"
          label={ordersCopy.promisedTime}
          defaultValue={valueOf(state, "promisedTime")}
          error={f.promisedTime}
        />
      </div>
      <Input
        name="observations"
        label={ordersCopy.observationsLabel}
        defaultValue={valueOf(state, "observations")}
        error={f.observations}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={ordersCopy.submitCreate} />
      </div>
    </form>
  );
}

/** Abrir la OS desde una cita recibida (sin recapturar cliente, vehículo ni servicios). */
export function FromAppointmentForm({
  appointmentId,
  requestId,
}: {
  appointmentId: string;
  requestId: string;
}) {
  const [state, action] = useActionState(createFromAppointmentAction, {});
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-md" noValidate>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="requestId" value={requestId} />
      <ChannelFields state={state} initial={{ channel: "b2c", reference: "" }} />
      <Input
        name="odometerKm"
        label={ordersCopy.odometerLabel}
        inputMode="numeric"
        defaultValue={valueOf(state, "odometerKm")}
        error={state.fields?.odometerKm}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={ordersCopy.fromAppointment} />
      </div>
    </form>
  );
}

/** Líneas: cambiar cantidad, quitar y agregar desde el catálogo del centro. */
export function OrderLines({
  order,
  services,
  editable,
  needsReason,
}: {
  order: ServiceOrder;
  services: CatalogItem[];
  editable: boolean;
  needsReason: boolean;
}) {
  const [state, action] = useActionState(setItemAction, {});
  useSuccessToast(state);
  const inOrder = new Set(order.items.map((i) => i.serviceId));
  // Tras un error, la línea enviada conserva lo capturado (React reinicia los formularios).
  const sent = (serviceId: string) => valueOf(state, "serviceId") === serviceId;
  const reason = (id: string, serviceId: string) =>
    needsReason ? (
      <Input
        name="reason"
        id={`reason-${id}`}
        label={ordersCopy.reasonLabel}
        hint={ordersCopy.lineReasonHint}
        required
        defaultValue={sent(serviceId) ? valueOf(state, "reason") : ""}
        error={sent(serviceId) ? state.fields?.reason : undefined}
      />
    ) : null;
  return (
    <div className="flex flex-col gap-md" key={`${state.at ?? 0}-${order.version}`}>
      {order.items.length === 0 ? <p className="text-sm text-muted">{ordersCopy.noLines}</p> : null}
      <ul aria-label={ordersCopy.linesTitle} className="flex flex-col gap-sm">
        {order.items.map((i) => (
          <li key={i.id} className="mg-card flex flex-col gap-sm">
            <div className="flex flex-wrap justify-between gap-sm text-sm">
              <span className="font-semibold">
                {i.serviceName} · {i.serviceCode} {i.kind === "producto" ? "(producto)" : ""}
              </span>
              <span>
                {i.quantity} × {formatMoney(i.unitPrice)} = {formatMoney(i.lineSubtotal)}
                {i.lineDiscount > 0 ? ` − ${formatMoney(i.lineDiscount)}` : ""}
              </span>
            </div>
            {editable ? (
              <form action={action} className="flex flex-wrap items-end gap-sm" noValidate>
                <Versioned order={order} />
                <input type="hidden" name="serviceId" value={i.serviceId} />
                <div className="flex-none">
                  <Input
                    name="quantity"
                    id={`quantity-${i.id}`}
                    label={ordersCopy.quantity}
                    inputMode="numeric"
                    defaultValue={
                      sent(i.serviceId) ? valueOf(state, "quantity", String(i.quantity)) : String(i.quantity)
                    }
                  />
                </div>
                {reason(i.id, i.serviceId)}
                <Submit label={ordersCopy.update} variant="secondary" />
                <Submit label={ordersCopy.remove} variant="danger" name="intent" value="remove" />
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <form action={action} className="flex flex-wrap items-end gap-sm" noValidate>
          <Versioned order={order} />
          <div className="flex-1">
            <Select
              name="serviceId"
              label={ordersCopy.itemsLabel}
              placeholder="Elige"
              defaultValue=""
              options={services
                .filter((s) => !inOrder.has(s.id))
                .map((s) => ({ value: s.id, label: `${s.name} · ${formatMoney(s.price)}` }))}
              error={state.fields?.serviceId}
            />
          </div>
          <div className="flex-none">
            <Input
              name="quantity"
              id="quantity-new"
              label={ordersCopy.quantity}
              inputMode="numeric"
              defaultValue="1"
            />
          </div>
          {reason("new", "")}
          <Submit label={ordersCopy.addLine} />
        </form>
      ) : null}
      <p className="text-xs text-muted">
        {ordersCopy.frozenHint} {ordersCopy.taxHint}
      </p>
      <Alert text={state.error ?? state.fields?.quantity} />
    </div>
  );
}

/** Descuentos: lista (anular con motivo) y alta con vista previa del nivel exigido. */
export function OrderDiscounts({
  order,
  rows,
  editable,
}: {
  order: ServiceOrder;
  rows: {
    id: string;
    target: string;
    value: string;
    amount: string;
    reason: string;
    level: string;
    active: boolean;
    voidable: boolean;
  }[];
  editable: boolean;
}) {
  const [state, action] = useActionState(addDiscountAction, {});
  const [voidState, voidAction] = useActionState(voidDiscountAction, {});
  useSuccessToast(state);
  useSuccessToast(voidState);
  const empty = { itemId: "", kind: "percent" as "percent" | "amount", value: "" };
  const [draft, setDraft] = useState(empty);
  // Con cada versión nueva de la OS (descuento aplicado u otro cambio) se limpia la captura.
  const [draftVersion, setDraftVersion] = useState(order.version);
  if (draftVersion !== order.version) {
    setDraftVersion(order.version);
    setDraft(empty);
  }
  const totals = computeOrderTotals(
    order.items,
    order.discounts.map((d) => ({
      itemId: d.itemId,
      kind: d.kind,
      value: d.value,
      voided: d.voidedAt !== null,
    })),
  );
  const amount = Number(draft.value.replace(/[$,\s]/g, ""));
  const preview =
    Number.isFinite(amount) && amount > 0
      ? previewDiscount(
          totals,
          order.paidAmount,
          {
            itemId: draft.itemId || null,
            kind: draft.kind,
            value: amount,
          },
          membershipDiscountTotal(order.discounts),
        )
      : null;
  return (
    <div className="flex flex-col gap-md">
      {rows.length > 0 ? (
        <ul aria-label={ordersCopy.discountsTitle} className="flex flex-col gap-sm text-sm">
          {rows.map((d) => (
            <li key={d.id} className="mg-card flex flex-col gap-xs">
              <span className={d.active ? "" : "text-muted line-through"}>
                {d.target} · {d.value} = {d.amount}
              </span>
              <span className="text-muted">
                {d.reason} · {ordersCopy.discountLevel}: {d.level}
              </span>
              {editable && d.voidable ? (
                <form action={voidAction} className="flex flex-wrap items-end gap-sm" noValidate>
                  <Versioned order={order} />
                  <input type="hidden" name="discountId" value={d.id} />
                  <Input
                    name="voidReason"
                    id={`void-${d.id}`}
                    label={ordersCopy.reasonLabel}
                    error={voidState.values?.discountId === d.id ? voidState.fields?.voidReason : undefined}
                  />
                  <Submit label={ordersCopy.voidDiscount} variant="danger" />
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Alert text={voidState.error} />
      {editable ? (
        <form
          key={`${state.at ?? 0}-${order.version}`}
          action={action}
          className="flex flex-col gap-md"
          noValidate
        >
          <Versioned order={order} />
          <div className="grid gap-lg md:grid-cols-3">
            <Select
              name="itemId"
              label={ordersCopy.discountTarget}
              value={draft.itemId}
              onChange={(e) => setDraft({ ...draft, itemId: e.target.value })}
              options={[
                { value: "", label: ordersCopy.wholeOrder },
                ...order.items.map((i) => ({ value: i.id, label: i.serviceName })),
              ]}
            />
            <Select
              name="kind"
              label={ordersCopy.discountKind}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as "percent" | "amount" })}
              options={[
                { value: "percent", label: ordersCopy.percent },
                { value: "amount", label: ordersCopy.amount },
              ]}
            />
            <Input
              name="value"
              label={ordersCopy.discountValue}
              inputMode="decimal"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              error={state.fields?.value}
              hint={
                preview
                  ? `${formatMoney(preview.amount)} · acumulado ${preview.percentAfter}% · ${ordersCopy.discountLevel}: ${DISCOUNT_LEVEL_LABELS[preview.requiredLevel]}`
                  : undefined
              }
            />
          </div>
          <Input
            name="reason"
            id="discount-reason"
            label={ordersCopy.reasonLabel}
            required
            defaultValue={valueOf(state, "reason")}
            error={state.fields?.reason}
          />
          {preview?.error ? <Alert text={preview.error} /> : null}
          <Alert text={state.error} />
          <div>
            <Submit label={ordersCopy.addDiscount} variant="secondary" />
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** Un botón por transición válida; las bloqueadas muestran la regla que falta. */
export function OrderStatusPanel({ order, actions }: { order: ServiceOrder; actions: OrderStatusAction[] }) {
  const [state, action] = useActionState(setOrderStatusAction, {});
  useSuccessToast(state);
  if (actions.length === 0) return null;
  return (
    <form
      key={`${state.at ?? 0}-${order.version}`}
      action={action}
      className="flex flex-col gap-md"
      noValidate
    >
      <Versioned order={order} />
      {actions.some((a) => a.needsReason && !a.blocker) ? (
        <Input
          name="statusReason"
          label={ordersCopy.reasonLabel}
          hint={ordersCopy.statusReasonHint}
          defaultValue={valueOf(state, "statusReason")}
          error={state.fields?.statusReason}
        />
      ) : null}
      <div className="flex flex-wrap gap-sm">
        {actions.map((a) => (
          <Submit
            key={a.to}
            name="status"
            value={a.to}
            label={a.label}
            variant={a.destructive ? "danger" : "primary"}
            disabled={a.blocker !== null}
          />
        ))}
      </div>
      {actions
        .filter((a) => a.blocker)
        .map((a) => (
          <p key={a.to} className="text-sm text-muted">
            {a.label}: {a.blocker}
          </p>
        ))}
      <Alert text={state.error} />
    </form>
  );
}

export function PaymentForm({ order, balance }: { order: ServiceOrder; balance: number }) {
  const [state, action] = useActionState(recordPaymentAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <form
      key={`${state.at ?? 0}-${order.version}`}
      action={action}
      className="flex flex-col gap-md"
      noValidate
    >
      <Versioned order={order} />
      <div className="grid gap-lg md:grid-cols-3">
        <Input
          name="amount"
          label={ordersCopy.paymentAmount}
          inputMode="decimal"
          defaultValue={valueOf(state, "amount", balance.toFixed(2))}
          error={f.amount}
        />
        <Select
          name="method"
          label={ordersCopy.paymentMethod}
          placeholder="Elige"
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
          defaultValue={valueOf(state, "method")}
          error={f.method}
        />
        <Input
          name="reference"
          id="payment-reference"
          label={ordersCopy.paymentReference}
          defaultValue={valueOf(state, "reference")}
          error={f.reference}
        />
      </div>
      <p className="text-xs text-muted">{ordersCopy.paymentHint}</p>
      <Alert text={state.error} />
      <div>
        <Submit label={ordersCopy.recordPayment} />
      </div>
    </form>
  );
}

/** Datos operativos: recursos, diagnóstico, recomendaciones y próxima visita. */
export function OrderDetailsForm({
  order,
  canChangeChannel,
  bays,
  technicians,
  services,
  initial,
}: {
  order: ServiceOrder;
  canChangeChannel: boolean;
  bays: Bay[];
  technicians: Technician[];
  services: CatalogItem[];
  initial: { promisedDate: string; promisedTime: string };
}) {
  const [state, action] = useActionState(updateDetailsAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const v = (key: string, fallback: string | number | null) =>
    valueOf(state, key, fallback === null ? "" : String(fallback));
  return (
    <form
      key={`${state.at ?? 0}-${order.version}`}
      action={action}
      className="flex flex-col gap-lg"
      noValidate
    >
      <Versioned order={order} />
      {canChangeChannel ? (
        <ChannelFields
          state={state}
          initial={{ channel: order.channel, reference: order.channelReference ?? "" }}
        />
      ) : (
        <>
          <input type="hidden" name="channel" value={order.channel} />
          <input type="hidden" name="channelReference" value={order.channelReference ?? ""} />
        </>
      )}
      <div className="grid gap-lg md:grid-cols-3">
        <Select
          name="bayId"
          label={ordersCopy.bayLabel}
          options={[
            noneOption,
            ...bays
              .filter((b) => b.active || b.id === order.bayId)
              .map((b) => ({ value: b.id, label: b.name })),
          ]}
          defaultValue={v("bayId", order.bayId)}
        />
        <Select
          name="technicianId"
          label={ordersCopy.technicianLabel}
          options={[
            noneOption,
            ...technicians
              .filter((t) => t.active || t.id === order.technicianId)
              .map((t) => ({ value: t.id, label: t.fullName })),
          ]}
          defaultValue={v("technicianId", order.technicianId)}
        />
        <Input
          name="odometerKm"
          label={ordersCopy.odometerLabel}
          inputMode="numeric"
          defaultValue={v("odometerKm", order.odometerKm)}
          error={f.odometerKm}
        />
      </div>
      <div className="grid gap-lg md:grid-cols-2">
        <Input
          name="promisedDate"
          type="date"
          label={ordersCopy.promisedDate}
          defaultValue={v("promisedDate", initial.promisedDate)}
          error={f.promisedDate}
        />
        <Input
          name="promisedTime"
          type="time"
          label={ordersCopy.promisedTime}
          defaultValue={v("promisedTime", initial.promisedTime)}
          error={f.promisedTime}
        />
      </div>
      <Input
        name="observations"
        label={ordersCopy.observationsLabel}
        defaultValue={v("observations", order.observations)}
        error={f.observations}
      />
      <Input
        name="diagnosis"
        label={ordersCopy.diagnosisLabel}
        defaultValue={v("diagnosis", order.diagnosis)}
        error={f.diagnosis}
      />
      <Input
        name="recommendations"
        label={ordersCopy.recommendationsLabel}
        defaultValue={v("recommendations", order.recommendations)}
        error={f.recommendations}
      />
      <fieldset className="grid gap-lg md:grid-cols-3">
        <legend className="mg-label">{ordersCopy.nextVisitTitle}</legend>
        <Input
          name="nextVisitOn"
          type="date"
          label={ordersCopy.nextVisitDate}
          defaultValue={v("nextVisitOn", order.nextVisitOn)}
          error={f.nextVisitOn}
        />
        <Select
          name="nextVisitServiceId"
          label={ordersCopy.nextVisitService}
          options={[noneOption, ...services.map((s) => ({ value: s.id, label: s.name }))]}
          defaultValue={v("nextVisitServiceId", order.nextVisitServiceId)}
        />
        <Input
          name="nextVisitNotes"
          label={ordersCopy.nextVisitNotes}
          defaultValue={v("nextVisitNotes", order.nextVisitNotes)}
          error={f.nextVisitNotes}
        />
      </fieldset>
      <Alert text={state.error} />
      <div>
        <Submit label={ordersCopy.submitDetails} variant="secondary" />
      </div>
    </form>
  );
}
