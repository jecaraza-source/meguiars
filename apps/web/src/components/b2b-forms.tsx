"use client";

import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_STATUSES,
  b2bCopy,
  B2B_ACCOUNT_STATUS_LABELS,
  B2B_ACCOUNT_STATUSES,
  B2B_PAYMENT_METHOD_LABELS,
  B2B_PAYMENT_METHODS,
  BILLING_MODEL_HINTS,
  BILLING_MODEL_LABELS,
  BILLING_MODELS,
  FEE_MODELS,
  formatMoney,
  PRICE_RULE_KIND_LABELS,
  PRICE_RULE_KINDS,
  VEHICLE_RULE_LABELS,
  VEHICLE_RULES,
  type B2bAccount,
  type B2bAccountForOrder,
  type B2bAgreement,
  type B2bInvoice,
  type B2bPriceRule,
  type B2bVehicle,
  type BillingModel,
  type CatalogItem,
  type PriceRuleKind,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  applyB2bAccountAction,
  createB2bOrderAction,
  createInvoiceAction,
  recordPaymentAction,
  setPriceRuleAction,
  setVehicleAction,
  upsertAccountAction,
  upsertAgreementAction,
  upsertContactAction,
  voidBillingAction,
  type B2bFormState,
} from "@/app/actions/b2b";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({ label, variant }: { label: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} />;
}

function Alert({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {text}
    </p>
  );
}

const valueOf = (state: B2bFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};
const valuesOf = (state: B2bFormState, key: string, fallback: string[]) => {
  const v = state.values?.[key];
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : fallback;
};

function useSuccessToast(state: B2bFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

// ---------------------------------------------------------------------------
// Cuenta
// ---------------------------------------------------------------------------

/** Alta (con empresa) o edición de la cuenta; la edición pide motivo. */
export function AccountForm({
  requestId,
  account,
  companies,
  centers,
  defaultCenterId,
}: {
  requestId: string;
  account?: B2bAccount;
  companies?: { id: string; name: string }[];
  centers: { id: string; name: string }[];
  defaultCenterId: string;
}) {
  const [state, action] = useActionState(upsertAccountAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const [clientId, setClientId] = useState(valueOf(state, "clientId", account?.clientId ?? ""));
  const companyName = companies?.find((c) => c.id === clientId)?.name ?? "";
  if (!account && companies?.length === 0) return <p className="text-sm text-muted">{b2bCopy.noCompanies}</p>;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-md" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      {account ? (
        <input type="hidden" name="clientId" value={account.clientId} />
      ) : (
        <Select
          name="clientId"
          label={b2bCopy.client}
          required
          placeholder={b2bCopy.chooseClient}
          options={(companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
          value={clientId}
          onChange={(e) => setClientId(e.currentTarget.value)}
          error={f.clientId}
        />
      )}
      <div className="grid gap-md md:grid-cols-2">
        <Input
          key={companyName}
          name="name"
          label={b2bCopy.name}
          required
          defaultValue={valueOf(state, "name", account?.name ?? companyName)}
          error={f.name}
        />
        <Input
          name="legalName"
          label={b2bCopy.legalName}
          defaultValue={valueOf(state, "legalName", account?.legalName ?? "")}
          error={f.legalName}
        />
        <Input
          name="rfc"
          label={b2bCopy.rfc}
          defaultValue={valueOf(state, "rfc", account?.rfc ?? "")}
          error={f.rfc}
        />
        <Input
          name="taxRegime"
          label={b2bCopy.taxRegime}
          inputMode="numeric"
          defaultValue={valueOf(state, "taxRegime", account?.taxRegime ?? "")}
          error={f.taxRegime}
        />
        <Input
          name="fiscalZip"
          label={b2bCopy.fiscalZip}
          inputMode="numeric"
          defaultValue={valueOf(state, "fiscalZip", account?.fiscalZip ?? "")}
          error={f.fiscalZip}
        />
        <Input
          name="billingEmail"
          type="email"
          label={b2bCopy.billingEmail}
          defaultValue={valueOf(state, "billingEmail", account?.billingEmail ?? "")}
          error={f.billingEmail}
        />
        <Select
          name="homeDetailCenterId"
          label={b2bCopy.homeCenter}
          options={centers.map((c) => ({ value: c.id, label: c.name }))}
          defaultValue={valueOf(state, "homeDetailCenterId", account?.homeDetailCenterId ?? defaultCenterId)}
          error={f.homeDetailCenterId}
        />
        <Select
          name="status"
          label={b2bCopy.status}
          options={B2B_ACCOUNT_STATUSES.map((s) => ({ value: s, label: B2B_ACCOUNT_STATUS_LABELS[s] }))}
          defaultValue={valueOf(state, "status", account?.status ?? "activa")}
        />
      </div>
      <Input
        name="notes"
        label={b2bCopy.notes}
        defaultValue={valueOf(state, "notes", account?.notes ?? "")}
      />
      {account ? (
        <Input
          name="reason"
          id="account-reason"
          label={b2bCopy.reason}
          required
          defaultValue={valueOf(state, "reason")}
          error={f.reason}
        />
      ) : null}
      <Alert text={state.error} />
      <div>
        <Submit label={account ? b2bCopy.saveAccount : b2bCopy.createAccount} variant="primary" />
      </div>
    </form>
  );
}

export function ContactForm({ accountId }: { accountId: string }) {
  const [state, action] = useActionState(upsertContactAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="accountId" value={accountId} />
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="fullName"
          label={b2bCopy.contactName}
          required
          defaultValue={valueOf(state, "fullName")}
          error={f.fullName}
        />
        <Input name="title" label={b2bCopy.contactTitle} defaultValue={valueOf(state, "title")} />
        <Input
          name="phone"
          label={b2bCopy.contactPhone}
          defaultValue={valueOf(state, "phone")}
          error={f.phone}
        />
        <Input
          name="email"
          label={b2bCopy.contactEmail}
          defaultValue={valueOf(state, "email")}
          error={f.email}
        />
      </div>
      <Checkbox
        name="isPrimary"
        value="on"
        label={b2bCopy.contactPrimary}
        checked={valueOf(state, "isPrimary") === "on"}
      />
      <Input
        name="reason"
        id="contact-reason"
        label={b2bCopy.reason}
        required
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={b2bCopy.addContact} />
      </div>
    </form>
  );
}

/** Autorizar o retirar un vehículo de la flotilla en la cuenta. */
export function VehicleToggle({ accountId, vehicle }: { accountId: string; vehicle: B2bVehicle }) {
  const [state, action] = useActionState(setVehicleAction, {});
  useSuccessToast(state);
  const [open, setOpen] = useState(false);
  const label = vehicle.authorized ? b2bCopy.revoke : b2bCopy.authorize;
  if (!open) return <Button label={label} variant="secondary" onClick={() => setOpen(true)} />;
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-sm"
      noValidate
      aria-label={`${label} ${vehicle.plate}`}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="vehicleId" value={vehicle.vehicleId} />
      <input type="hidden" name="active" value={vehicle.authorized ? "false" : "true"} />
      {vehicle.authorized ? null : (
        <div className="grid gap-sm md:grid-cols-2">
          <Input
            name="costCenter"
            id={`cc-${vehicle.vehicleId}`}
            label={b2bCopy.costCenter}
            defaultValue={valueOf(state, "costCenter")}
          />
          <Input
            name="driverName"
            id={`drv-${vehicle.vehicleId}`}
            label={b2bCopy.driver}
            defaultValue={valueOf(state, "driverName")}
          />
        </div>
      )}
      <Input
        name="reason"
        id={`veh-reason-${vehicle.vehicleId}`}
        label={b2bCopy.reason}
        required
        defaultValue={valueOf(state, "reason")}
        error={state.fields?.reason}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={label} variant={vehicle.authorized ? "danger" : "primary"} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Convenio y tarifas
// ---------------------------------------------------------------------------

export function AgreementForm({
  accountId,
  requestId,
  agreement,
  centers,
  today,
}: {
  accountId: string;
  requestId: string;
  agreement?: B2bAgreement;
  centers: { id: string; name: string }[];
  today: string;
}) {
  const [state, action] = useActionState(upsertAgreementAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const [model, setModel] = useState<BillingModel>(
    (valueOf(state, "billingModel", agreement?.billingModel ?? "por_vehiculo") as BillingModel) ??
      "por_vehiculo",
  );
  const selected = valuesOf(state, "centerIds", agreement?.centerIds ?? centers.map((c) => c.id));
  const withFee = FEE_MODELS.includes(model);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-md" noValidate>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="requestId" value={requestId} />
      {agreement ? <input type="hidden" name="id" value={agreement.id} /> : null}
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="name"
          label={b2bCopy.agreementName}
          required
          defaultValue={valueOf(state, "name", agreement?.name ?? "")}
          error={f.name}
        />
        <Select
          name="billingModel"
          label={b2bCopy.billingModel}
          hint={BILLING_MODEL_HINTS[model]}
          options={BILLING_MODELS.map((m) => ({ value: m, label: BILLING_MODEL_LABELS[m] }))}
          value={model}
          onChange={(e) => setModel(e.currentTarget.value as BillingModel)}
          error={f.billingModel}
        />
        <Input
          name="startsOn"
          type="date"
          label={b2bCopy.startsOn}
          required
          defaultValue={valueOf(state, "startsOn", agreement?.startsOn ?? today)}
          error={f.startsOn}
        />
        <Input
          name="endsOn"
          type="date"
          label={b2bCopy.endsOn}
          required
          defaultValue={valueOf(state, "endsOn", agreement?.endsOn ?? "")}
          error={f.endsOn}
        />
        <Select
          name="status"
          label={b2bCopy.agreementStatus}
          options={AGREEMENT_STATUSES.map((s) => ({ value: s, label: AGREEMENT_STATUS_LABELS[s] }))}
          defaultValue={valueOf(state, "status", agreement?.status ?? "activo")}
        />
        <Select
          name="vehicleRule"
          label={b2bCopy.vehicleRule}
          options={VEHICLE_RULES.map((r) => ({ value: r, label: VEHICLE_RULE_LABELS[r] }))}
          defaultValue={valueOf(state, "vehicleRule", agreement?.vehicleRule ?? "lista")}
        />
        <Input
          name="paymentTermsDays"
          label={b2bCopy.paymentTerms}
          inputMode="numeric"
          defaultValue={valueOf(state, "paymentTermsDays", String(agreement?.paymentTermsDays ?? 30))}
          error={f.paymentTermsDays}
        />
        <Input
          name="creditLimit"
          label={b2bCopy.creditLimit}
          inputMode="decimal"
          defaultValue={valueOf(
            state,
            "creditLimit",
            agreement?.creditLimit != null ? String(agreement.creditLimit) : "",
          )}
          error={f.creditLimit}
        />
        {withFee ? (
          <>
            <Input
              name="feeAmount"
              label={`${b2bCopy.feeAmount} ${model === "iguala" ? "mensual" : "del paquete"}`}
              inputMode="decimal"
              required
              defaultValue={valueOf(
                state,
                "feeAmount",
                agreement?.feeAmount != null ? String(agreement.feeAmount) : "",
              )}
              error={f.feeAmount}
            />
            <Input
              name="includedUnits"
              label={`${b2bCopy.includedUnits} ${model === "iguala" ? "por mes" : "en la vigencia"}`}
              inputMode="numeric"
              required
              defaultValue={valueOf(
                state,
                "includedUnits",
                agreement?.includedUnits != null ? String(agreement.includedUnits) : "",
              )}
              error={f.includedUnits}
            />
          </>
        ) : null}
      </div>
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">{b2bCopy.centers} *</legend>
        {centers.map((c) => (
          <Checkbox
            key={c.id}
            name="centerIds"
            value={c.id}
            label={c.name}
            checked={selected.includes(c.id)}
          />
        ))}
        {f.centerIds ? (
          <span className="mg-error" role="alert">
            {f.centerIds}
          </span>
        ) : null}
      </fieldset>
      <Input
        name="notes"
        label={b2bCopy.notes}
        defaultValue={valueOf(state, "notes", agreement?.notes ?? "")}
      />
      <Input
        name="reason"
        id="agreement-reason"
        label={b2bCopy.reason}
        required
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <p className="text-sm text-muted">{b2bCopy.agreementExpiredHint}</p>
      <Alert text={state.error} />
      <div>
        <Submit label={b2bCopy.saveAgreement} variant="primary" />
      </div>
    </form>
  );
}

export function PriceRuleForm({
  agreementId,
  services,
  model,
}: {
  agreementId: string;
  services: CatalogItem[];
  model: BillingModel;
}) {
  const [state, action] = useActionState(setPriceRuleAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const kinds = PRICE_RULE_KINDS.filter((k) => k !== "incluido" || FEE_MODELS.includes(model));
  const [kind, setKind] = useState<PriceRuleKind>(
    (valueOf(state, "kind", "precio_fijo") as PriceRuleKind) ?? "precio_fijo",
  );
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="agreementId" value={agreementId} />
      <div className="grid gap-md md:grid-cols-4">
        <Select
          name="serviceId"
          label={b2bCopy.ruleService}
          options={[
            { value: "", label: b2bCopy.allServices },
            ...services.map((s) => ({ value: s.id, label: `${s.name} · ${formatMoney(s.price)}` })),
          ]}
          defaultValue={valueOf(state, "serviceId")}
        />
        <Select
          name="kind"
          label={b2bCopy.ruleKind}
          options={kinds.map((k) => ({ value: k, label: PRICE_RULE_KIND_LABELS[k] }))}
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value as PriceRuleKind)}
          error={f.kind}
        />
        {kind === "incluido" ? null : (
          <Input
            name="value"
            label={b2bCopy.ruleValue}
            inputMode="decimal"
            required
            defaultValue={valueOf(state, "value")}
            error={f.value}
          />
        )}
        {model === "volumen_mensual" ? (
          <Input
            name="minMonthlyOrders"
            label={b2bCopy.ruleMinVolume}
            inputMode="numeric"
            defaultValue={valueOf(state, "minMonthlyOrders", "0")}
            error={f.minMonthlyOrders}
          />
        ) : null}
      </div>
      <Input
        name="reason"
        id="rule-reason"
        label={b2bCopy.reason}
        required
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={b2bCopy.addRule} />
      </div>
    </form>
  );
}

/** Activar o desactivar una tarifa, con motivo. */
export function RuleToggle({ rule }: { rule: B2bPriceRule }) {
  const [state, action] = useActionState(setPriceRuleAction, {});
  useSuccessToast(state);
  const [open, setOpen] = useState(false);
  const label = rule.active ? b2bCopy.deactivate : b2bCopy.activate;
  if (!open) return <Button label={label} variant="secondary" onClick={() => setOpen(true)} />;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="agreementId" value={rule.agreementId} />
      <input type="hidden" name="id" value={rule.id} />
      <input type="hidden" name="serviceId" value={rule.serviceId ?? ""} />
      <input type="hidden" name="kind" value={rule.kind} />
      <input type="hidden" name="value" value={rule.value ?? ""} />
      <input type="hidden" name="minMonthlyOrders" value={rule.minMonthlyOrders} />
      <input type="hidden" name="active" value={rule.active ? "false" : "true"} />
      <div className="flex-1">
        <Input
          name="reason"
          id={`rule-reason-${rule.id}`}
          label={b2bCopy.reason}
          required
          error={state.fields?.reason}
        />
      </div>
      <Submit label={label} variant={rule.active ? "danger" : "primary"} />
      <Alert text={state.error} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Facturación
// ---------------------------------------------------------------------------

export function InvoiceForm({
  accountId,
  requestId,
  orders,
  feePending,
  today,
}: {
  accountId: string;
  requestId: string;
  orders: { id: string; folio: string; total: number }[];
  feePending: number;
  today: string;
}) {
  const [state, action] = useActionState(createInvoiceAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const selected = valuesOf(
    state,
    "orderIds",
    orders.map((o) => o.id),
  );
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-muted">{b2bCopy.billingHint}</p>
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="reference"
          label={b2bCopy.invoiceReference}
          required
          defaultValue={valueOf(state, "reference")}
          error={f.reference}
        />
        <Input
          name="issuedOn"
          type="date"
          label={b2bCopy.issuedOn}
          required
          defaultValue={valueOf(state, "issuedOn", today)}
          error={f.issuedOn}
        />
      </div>
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">{b2bCopy.invoiceOrders}</legend>
        {orders.length === 0 ? <span className="text-sm text-muted">—</span> : null}
        {orders.map((o) => (
          <Checkbox
            key={o.id}
            name="orderIds"
            value={o.id}
            label={`${o.folio} · ${formatMoney(o.total)}`}
            checked={selected.includes(o.id)}
          />
        ))}
        {f.orderIds ? (
          <span className="mg-error" role="alert">
            {f.orderIds}
          </span>
        ) : null}
      </fieldset>
      {feePending > 0 ? (
        <Input
          name="feeAmount"
          label={`${b2bCopy.invoiceFee} (pendiente ${formatMoney(feePending)})`}
          inputMode="decimal"
          defaultValue={valueOf(state, "feeAmount", String(feePending))}
          error={f.feeAmount}
        />
      ) : null}
      <Alert text={state.error} />
      <div>
        <Submit label={b2bCopy.newInvoice} variant="primary" />
      </div>
    </form>
  );
}

export function B2bPaymentForm({
  accountId,
  requestId,
  invoices,
  today,
}: {
  accountId: string;
  requestId: string;
  invoices: B2bInvoice[];
  today: string;
}) {
  const [state, action] = useActionState(recordPaymentAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="amount"
          label={b2bCopy.paymentAmount}
          inputMode="decimal"
          required
          defaultValue={valueOf(state, "amount")}
          error={f.amount}
        />
        <Select
          name="method"
          label={b2bCopy.paymentMethod}
          options={B2B_PAYMENT_METHODS.map((m) => ({ value: m, label: B2B_PAYMENT_METHOD_LABELS[m] }))}
          defaultValue={valueOf(state, "method", "transferencia")}
        />
        <Input
          name="paidOn"
          id="paid-on"
          type="date"
          label={b2bCopy.paidOn}
          required
          defaultValue={valueOf(state, "paidOn", today)}
          error={f.paidOn}
        />
        <Input
          name="reference"
          id="payment-reference"
          label={b2bCopy.paymentReference}
          defaultValue={valueOf(state, "reference")}
        />
        <Select
          name="invoiceId"
          label={b2bCopy.paymentInvoice}
          options={[
            { value: "", label: "—" },
            ...invoices
              .filter((i) => i.status === "emitida")
              .map((i) => ({ value: i.id, label: `${i.reference} · ${formatMoney(i.amount)}` })),
          ]}
          defaultValue={valueOf(state, "invoiceId")}
        />
      </div>
      <Alert text={state.error} />
      <div>
        <Submit label={b2bCopy.newPayment} variant="primary" />
      </div>
    </form>
  );
}

export function VoidBillingButton({
  accountId,
  kind,
  id,
  label,
}: {
  accountId: string;
  kind: "invoice" | "payment";
  id: string;
  label: string;
}) {
  const [state, action] = useActionState(voidBillingAction, {});
  useSuccessToast(state);
  const [open, setOpen] = useState(false);
  if (!open) return <Button label={label} variant="secondary" onClick={() => setOpen(true)} />;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <div className="flex-1">
        <Input name="reason" id={`void-${id}`} label={b2bCopy.reason} required error={state.fields?.reason} />
      </div>
      <Submit label={label} variant="danger" />
      <Alert text={state.error} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// OS a cuenta B2B
// ---------------------------------------------------------------------------

/** OS a cuenta B2B: cuenta con convenio vigente, vehículo autorizado, orden de compra y líneas. */
export function NewB2bOrderForm({
  requestId,
  accounts,
  services,
}: {
  requestId: string;
  accounts: B2bAccountForOrder[];
  services: CatalogItem[];
}) {
  const [state, action] = useActionState(createB2bOrderAction, {});
  const f = state.fields ?? {};
  const [accountId, setAccountId] = useState(
    valueOf(state, "accountId", accounts.length === 1 ? accounts[0]!.accountId : ""),
  );
  const account = accounts.find((a) => a.accountId === accountId);
  if (accounts.length === 0) return <p className="text-sm text-muted">{b2bCopy.noAccounts}</p>;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <Select
        name="accountId"
        label={b2bCopy.orderAccount}
        required
        placeholder={b2bCopy.chooseAccount}
        options={accounts.map((a) => ({
          value: a.accountId,
          label: `${a.accountName} · ${a.agreementName}`,
        }))}
        value={accountId}
        onChange={(e) => setAccountId(e.currentTarget.value)}
        error={f.accountId}
      />
      {account ? (
        <p className="text-sm text-muted">
          {BILLING_MODEL_LABELS[account.billingModel]} · {VEHICLE_RULE_LABELS[account.vehicleRule]}
        </p>
      ) : null}
      <Select
        key={accountId}
        name="vehicleId"
        label="Vehículo"
        required
        placeholder="Elige el vehículo"
        options={(account?.vehicles ?? []).map((v) => ({
          value: v.id,
          label: `${v.make} ${v.model} ${v.year} · ${v.plate}`,
        }))}
        defaultValue={valueOf(
          state,
          "vehicleId",
          account?.vehicles.length === 1 ? account.vehicles[0]!.id : "",
        )}
        error={f.vehicleId}
      />
      <Input
        name="purchaseOrder"
        label={b2bCopy.purchaseOrder}
        defaultValue={valueOf(state, "purchaseOrder")}
        error={f.purchaseOrder}
      />
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">Servicios y productos *</legend>
        <span className="mg-hint">{b2bCopy.listPrice}: la tarifa del convenio se aplica al guardar.</span>
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-sm">
            <label htmlFor={`b2b-qty-${s.id}`} className="text-sm">
              {s.name} · {formatMoney(s.price)}
            </label>
            <input
              id={`b2b-qty-${s.id}`}
              name={`qty:${s.id}`}
              inputMode="numeric"
              aria-label={`Cantidad: ${s.name}`}
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
      <Input
        name="observations"
        label="Observaciones de recepción (opcional)"
        defaultValue={valueOf(state, "observations")}
      />
      <Alert text={state.error} />
      <div>
        <Submit label="Abrir OS a cuenta" variant="primary" />
      </div>
    </form>
  );
}

/** Aplicar la cuenta B2B a una OS abierta del cliente empresa (re-precia sus líneas). */
export function ApplyB2bForm({
  orderId,
  version,
  accounts,
  purchaseOrder,
}: {
  orderId: string;
  version: number;
  accounts: B2bAccountForOrder[];
  purchaseOrder: string | null;
}) {
  const [state, action] = useActionState(applyB2bAccountAction, {});
  useSuccessToast(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="version" value={version} />
      <p className="text-sm text-muted">{b2bCopy.applyHint}</p>
      <div className="grid gap-md md:grid-cols-2">
        <Select
          name="accountId"
          label={b2bCopy.orderAccount}
          options={accounts.map((a) => ({
            value: a.accountId,
            label: `${a.accountName} · ${a.agreementName}`,
          }))}
          defaultValue={valueOf(state, "accountId", accounts[0]?.accountId ?? "")}
        />
        <Input
          name="purchaseOrder"
          id="apply-po"
          label={b2bCopy.purchaseOrder}
          defaultValue={valueOf(state, "purchaseOrder", purchaseOrder ?? "")}
        />
      </div>
      <Alert text={state.error} />
      <div>
        <Submit label={b2bCopy.applyAccount} variant="primary" />
      </div>
    </form>
  );
}
