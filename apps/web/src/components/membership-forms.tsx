"use client";

import {
  canChangePlanOnRenewal,
  formatMoney,
  membershipsCopy,
  PERIOD_LABELS,
  PERIOD_MONTHS,
  PLAN_TIER_LABELS,
  PLAN_TIERS,
  presentPlan,
  REDEEM_SCOPE_LABELS,
  REDEEM_SCOPES,
  type CatalogItem,
  type MembershipAction,
  type MembershipPlan,
  type MembershipStatus,
  type RedeemableLine,
  type Vehicle,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createMembershipAction,
  redeemBenefitAction,
  renewMembershipAction,
  setBenefitAction,
  setMembershipStateAction,
  upsertPlanAction,
  voidRedemptionAction,
  type MembershipFormState,
} from "@/app/actions/memberships";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
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

const valueOf = (state: MembershipFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: MembershipFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

/** Alta de membresía: vehículo del cliente, plan disponible, inicio y referencia de pago. */
export function NewMembershipForm({
  requestId,
  clientId,
  vehicles,
  plans,
  today,
}: {
  requestId: string;
  clientId: string;
  vehicles: Vehicle[];
  plans: MembershipPlan[];
  today: string;
}) {
  const [state, action] = useActionState(createMembershipAction, {});
  const f = state.fields ?? {};
  const active = vehicles.filter((v) => v.active);
  const [planId, setPlanId] = useState(valueOf(state, "planId", plans.length === 1 ? plans[0]!.id : ""));
  const plan = plans.find((p) => p.id === planId);
  if (active.length === 0) return <p className="text-sm text-muted">{membershipsCopy.noVehicles}</p>;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      {/* Misma llave en reintentos: la base no contrata dos veces. */}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="clientId" value={clientId} />
      <Select
        name="vehicleId"
        label={membershipsCopy.vehicle}
        required
        placeholder="Elige el vehículo"
        options={active.map((v) => ({ value: v.id, label: `${v.make} ${v.model} ${v.year} · ${v.plate}` }))}
        defaultValue={valueOf(state, "vehicleId", active.length === 1 ? active[0]!.id : "")}
        error={f.vehicleId}
      />
      <Select
        name="planId"
        label={membershipsCopy.plan}
        required
        placeholder="Elige el plan"
        options={plans.map((p) => ({
          value: p.id,
          label: `${presentPlan(p).name} · ${presentPlan(p).price}`,
        }))}
        value={planId}
        onChange={(e) => setPlanId(e.target.value)}
        error={f.planId}
      />
      {plan ? (
        <div className="mg-card flex flex-col gap-xs text-sm" aria-live="polite">
          <span className="font-semibold">{presentPlan(plan).benefits}</span>
          <span className="text-muted">
            {presentPlan(plan).period} · {presentPlan(plan).scope}
            {plan.restrictions ? ` · ${plan.restrictions}` : ""}
          </span>
        </div>
      ) : null}
      <div className="grid gap-lg md:grid-cols-2">
        <Input
          name="startsOn"
          type="date"
          label={membershipsCopy.startsOn}
          min={today}
          defaultValue={valueOf(state, "startsOn", today)}
          error={f.startsOn}
        />
        <Input
          name="paymentReference"
          label={membershipsCopy.paymentReference}
          hint={membershipsCopy.paymentHint}
          defaultValue={valueOf(state, "paymentReference")}
          error={f.paymentReference}
        />
      </div>
      <Alert text={state.error} />
      <div>
        <Submit
          label={plan ? `${membershipsCopy.create} · ${formatMoney(plan.price)}` : membershipsCopy.create}
        />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Acciones de la membresía
// ---------------------------------------------------------------------------

export function MembershipActions({
  membershipId,
  status,
  actions,
  plans,
  currentPlanId,
  requestId,
}: {
  membershipId: string;
  status: MembershipStatus;
  actions: MembershipAction[];
  plans: MembershipPlan[];
  currentPlanId: string;
  requestId: string;
}) {
  const [renewState, renew] = useActionState(renewMembershipAction, {});
  const [stateState, setState] = useActionState(setMembershipStateAction, {});
  useSuccessToast(renewState);
  useSuccessToast(stateState);
  const [open, setOpen] = useState<MembershipAction["kind"] | null>(null);
  const renewAction = actions.find((a) => a.kind === "renew");
  const stateActions = actions.filter((a) => a.kind !== "renew");
  if (actions.length === 0) return <p className="text-sm text-muted">{membershipsCopy.renewHint}</p>;
  return (
    <div className="flex flex-col gap-md">
      {renewAction ? (
        <form key={renewState.at ?? 0} action={renew} className="flex flex-col gap-sm" noValidate>
          <input type="hidden" name="membershipId" value={membershipId} />
          <input type="hidden" name="requestId" value={requestId} />
          <div className="grid gap-md md:grid-cols-2">
            {canChangePlanOnRenewal(status) ? (
              <Select
                name="planId"
                label={membershipsCopy.renewChangePlan}
                options={plans.map((p) => ({
                  value: p.id === currentPlanId ? "" : p.id,
                  label: `${presentPlan(p).name} · ${presentPlan(p).price}${p.id === currentPlanId ? ` (${membershipsCopy.samePlan})` : ""}`,
                }))}
                defaultValue={valueOf(renewState, "planId")}
              />
            ) : null}
            <Input
              name="paymentReference"
              id="renew-payment"
              label={membershipsCopy.paymentReference}
              hint={membershipsCopy.paymentHint}
              defaultValue={valueOf(renewState, "paymentReference")}
            />
          </div>
          <Alert text={renewState.error} />
          <div>
            <Submit label={renewAction.label} />
          </div>
        </form>
      ) : null}
      {stateActions.length > 0 ? (
        <div className="flex flex-wrap gap-sm">
          {stateActions.map((a) => (
            <Button key={a.kind} label={a.label} variant={a.variant} onClick={() => setOpen(a.kind)} />
          ))}
        </div>
      ) : null}
      {stateActions
        .filter((a) => a.kind === open)
        .map((a) => (
          <form
            key={`${a.kind}-${stateState.at ?? 0}`}
            action={setState}
            className="flex flex-wrap items-end gap-sm"
            noValidate
          >
            <input type="hidden" name="membershipId" value={membershipId} />
            <input type="hidden" name="state" value={a.state} />
            <div className="flex-1">
              <Input
                name="reason"
                id="state-reason"
                label={membershipsCopy.reason}
                required
                defaultValue={valueOf(stateState, "reason")}
                error={stateState.fields?.reason}
              />
            </div>
            <Submit label={a.label} variant={a.variant} />
          </form>
        ))}
      <Alert text={stateState.error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redención desde la OS
// ---------------------------------------------------------------------------

export function OrderMembershipRedeem({
  orderId,
  version,
  membershipId,
  lines,
  requestId,
}: {
  orderId: string;
  version: number;
  membershipId: string;
  lines: RedeemableLine[];
  requestId: string;
}) {
  const [state, action] = useActionState(redeemBenefitAction, {});
  useSuccessToast(state);
  const [itemId, setItemId] = useState(lines.length === 1 ? lines[0]!.itemId : "");
  const line = lines.find((l) => l.itemId === itemId);
  return (
    <form
      key={`${state.at ?? 0}-${version}`}
      action={action}
      className="flex flex-wrap items-end gap-sm"
      noValidate
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="membershipId" value={membershipId} />
      {/* Llave nueva por versión de la OS: un doble clic no redime dos veces. */}
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex-1">
        <Select
          name="itemId"
          id="redeem-item"
          label="Línea"
          placeholder="Elige la línea"
          options={lines.map((l) => ({ value: l.itemId, label: l.label }))}
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          error={state.fields?.itemId}
        />
      </div>
      <div className="flex-none">
        <Input
          name="quantity"
          id="redeem-quantity"
          label={membershipsCopy.redeemQuantity}
          inputMode="numeric"
          defaultValue={String(line?.maxQuantity ?? 1)}
          key={itemId}
          error={state.fields?.quantity}
        />
      </div>
      <Submit label={membershipsCopy.redeem} disabled={!itemId} />
      <div className="basis-full">
        <Alert text={state.error} />
      </div>
    </form>
  );
}

export function VoidRedemptionForm({
  orderId,
  version,
  redemptionId,
}: {
  orderId: string;
  version: number;
  redemptionId: string;
}) {
  const [state, action] = useActionState(voidRedemptionAction, {});
  useSuccessToast(state);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button
        label={membershipsCopy.voidRedemption}
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      />
    );
  return (
    <form
      key={`${state.at ?? 0}-${version}`}
      action={action}
      className="flex flex-wrap items-end gap-sm"
      noValidate
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="redemptionId" value={redemptionId} />
      <div className="flex-1">
        <Input
          name="reason"
          id={`void-red-${redemptionId}`}
          label={membershipsCopy.voidReason}
          required
          defaultValue={valueOf(state, "reason")}
          error={state.fields?.reason}
        />
      </div>
      <Submit label={membershipsCopy.voidRedemption} variant="danger" />
      <div className="basis-full">
        <Alert text={state.error} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Planes (admin corporativo)
// ---------------------------------------------------------------------------

export function PlanForm({ plan, today }: { plan?: MembershipPlan; today: string }) {
  const [state, action] = useActionState(upsertPlanAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const v = (key: string, fallback: string) => valueOf(state, key, fallback);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-md" noValidate>
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="code"
          label={membershipsCopy.planCode}
          required
          readOnly={Boolean(plan)}
          defaultValue={v("code", plan?.code ?? "")}
          error={f.code}
        />
        <Select
          name="tier"
          label={membershipsCopy.planTier}
          options={PLAN_TIERS.map((t) => ({ value: t, label: PLAN_TIER_LABELS[t] }))}
          defaultValue={v("tier", plan?.tier ?? "care")}
          error={f.tier}
        />
        <Input
          name="name"
          label={membershipsCopy.planName}
          required
          defaultValue={v("name", plan?.name ?? "")}
          error={f.name}
        />
      </div>
      <Input
        name="description"
        label={membershipsCopy.planDescription}
        defaultValue={v("description", plan?.description ?? "")}
        error={f.description}
      />
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="price"
          label={membershipsCopy.planPrice}
          inputMode="decimal"
          required
          defaultValue={v("price", plan ? String(plan.price) : "")}
          error={f.price}
        />
        <Select
          name="periodMonths"
          label={membershipsCopy.planPeriod}
          options={PERIOD_MONTHS.map((m) => ({ value: String(m), label: PERIOD_LABELS[m]! }))}
          defaultValue={v("periodMonths", String(plan?.periodMonths ?? 1))}
          error={f.periodMonths}
        />
        <Select
          name="redeemScope"
          label={membershipsCopy.planScope}
          options={REDEEM_SCOPES.map((s) => ({ value: s, label: REDEEM_SCOPE_LABELS[s] }))}
          defaultValue={v("redeemScope", plan?.redeemScope ?? "centro_origen")}
          error={f.redeemScope}
        />
      </div>
      <Input
        name="restrictions"
        label={membershipsCopy.planRestrictions}
        defaultValue={v("restrictions", plan?.restrictions ?? "")}
        error={f.restrictions}
      />
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="renewalNoticeDays"
          label={membershipsCopy.planNotice}
          inputMode="numeric"
          defaultValue={v("renewalNoticeDays", String(plan?.renewalNoticeDays ?? 7))}
          error={f.renewalNoticeDays}
        />
        <Input
          name="availableFrom"
          type="date"
          label={membershipsCopy.planAvailableFrom}
          defaultValue={v("availableFrom", plan?.availableFrom ?? today)}
          error={f.availableFrom}
        />
        <Input
          name="availableUntil"
          type="date"
          label={membershipsCopy.planAvailableUntil}
          defaultValue={v("availableUntil", plan?.availableUntil ?? "")}
          error={f.availableUntil}
        />
      </div>
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="reason"
          id="plan-reason"
          label={membershipsCopy.reason}
          required
          defaultValue={v("reason", "")}
          error={f.reason}
        />
        <Checkbox
          name="active"
          value="1"
          label={membershipsCopy.planActive}
          checked={plan ? plan.active : true}
        />
      </div>
      <Alert text={state.error} />
      <div>
        <Submit label={plan ? membershipsCopy.planSave : membershipsCopy.newPlan} />
      </div>
    </form>
  );
}

export function BenefitsEditor({ plan, services }: { plan: MembershipPlan; services: CatalogItem[] }) {
  const [state, action] = useActionState(setBenefitAction, {});
  useSuccessToast(state);
  const [removing, setRemoving] = useState<string | null>(null);
  const f = state.fields ?? {};
  return (
    <div className="flex flex-col gap-md" key={state.at ?? 0}>
      <p className="text-sm text-muted">{membershipsCopy.benefitsHint}</p>
      <ul aria-label={membershipsCopy.benefitsTitle} className="flex flex-col gap-sm">
        {plan.benefits.map((b) => (
          <li key={b.id} className="mg-card flex flex-col gap-sm text-sm">
            <div className="flex flex-wrap justify-between gap-sm">
              <span className="font-semibold">
                {b.serviceName} · {b.serviceCode}
              </span>
              <span>
                {b.quantityPerPeriod} {membershipsCopy.benefitQuantity.toLowerCase()}
              </span>
            </div>
            {removing === b.serviceId ? (
              <form action={action} className="flex flex-wrap items-end gap-sm" noValidate>
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="serviceId" value={b.serviceId} />
                <div className="flex-1">
                  <Input
                    name="reason"
                    id={`benefit-remove-${b.serviceId}`}
                    label={membershipsCopy.reason}
                    required
                    error={f.reason}
                  />
                </div>
                <Submit label={membershipsCopy.benefitRemove} variant="danger" name="intent" value="remove" />
              </form>
            ) : (
              <div>
                <Button
                  label={membershipsCopy.benefitRemove}
                  variant="secondary"
                  size="sm"
                  onClick={() => setRemoving(b.serviceId)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <form action={action} className="flex flex-col gap-sm" noValidate>
        <input type="hidden" name="planId" value={plan.id} />
        <div className="grid gap-md md:grid-cols-3">
          <Select
            name="serviceId"
            id="benefit-service"
            label={membershipsCopy.benefitService}
            placeholder="Elige"
            options={services.map((s) => ({ value: s.id, label: `${s.name} · ${s.code}` }))}
            defaultValue={valueOf(state, "serviceId")}
            error={f.serviceId}
          />
          <Input
            name="quantityPerPeriod"
            id="benefit-quantity"
            label={membershipsCopy.benefitQuantity}
            inputMode="numeric"
            required
            defaultValue={valueOf(state, "quantityPerPeriod", "1")}
            error={f.quantityPerPeriod}
          />
          <Input
            name="reason"
            id="benefit-reason"
            label={membershipsCopy.reason}
            required
            defaultValue={valueOf(state, "reason")}
            error={removing ? undefined : f.reason}
          />
        </div>
        <div>
          <Submit label={membershipsCopy.benefitSave} variant="secondary" />
        </div>
      </form>
      <Alert text={state.error} />
    </div>
  );
}
