import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_STATUSES,
  b2bCopy,
  b2bErrorMessage,
  B2B_ACCOUNT_STATUS_LABELS,
  B2B_ACCOUNT_STATUSES,
  BILLING_MODEL_HINTS,
  BILLING_MODEL_LABELS,
  BILLING_MODELS,
  FEE_MODELS,
  formatMoney,
  newRequestId,
  PRICE_RULE_KIND_LABELS,
  PRICE_RULE_KINDS,
  VEHICLE_RULE_LABELS,
  VEHICLE_RULES,
  type B2bAccount,
  type B2bAccountForOrder,
  type B2bAgreement,
  type B2bPriceRule,
  type B2bVehicle,
  type BillingModel,
  type CatalogItem,
  type RepoError,
  type Result,
} from "@meguiars/domain";
import { createB2bRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import {
  b2bAccountSchema,
  b2bAgreementSchema,
  b2bContactSchema,
  b2bPriceRuleSchema,
  b2bVehicleSchema,
  createB2bOrderSchema,
  fieldErrors,
} from "@meguiars/validation";
import { space } from "@meguiars/ui-tokens";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Field, Select } from "@/ui/controls";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";

/**
 * Formularios B2B de móvil (equivalen a components/b2b-forms.tsx de web). Validan
 * con los mismos esquemas vía el repositorio; la base vuelve a validar.
 */

type Repo = ReturnType<typeof createB2bRepository>;

/** Envío con estado de carga, errores por campo y mensaje visible. */
function useSubmit() {
  const { client } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit<T>(
    schema: z.ZodType | null,
    input: unknown,
    call: (repo: Repo, client: MeguiarsSupabaseClient) => Promise<Result<T>>,
    onOk: (data: T) => void,
  ) {
    if (!client) return;
    if (schema) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return setFields(fieldErrors(parsed.error));
    }
    setFields({});
    setError(null);
    setBusy(true);
    const r = await call(createB2bRepository(client), client);
    setBusy(false);
    if (!r.ok) return setError(b2bErrorMessage(r.error as RepoError));
    toast({ message: b2bCopy.saved, tone: "success" });
    onOk(r.data);
  }
  return { busy, error, fields, submit };
}

// ---------------------------------------------------------------------------
// Cuenta, contactos y vehículos
// ---------------------------------------------------------------------------

export function AccountEditor({
  account,
  companies,
  centers,
  defaultCenterId,
  onSaved,
}: {
  account?: B2bAccount;
  companies?: { id: string; name: string }[];
  centers: { id: string; name: string }[];
  defaultCenterId: string;
  onSaved: (id: string) => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const [requestId] = useState(newRequestId);
  const [v, setV] = useState({
    clientId: account?.clientId ?? "",
    name: account?.name ?? "",
    legalName: account?.legalName ?? "",
    rfc: account?.rfc ?? "",
    taxRegime: account?.taxRegime ?? "",
    fiscalZip: account?.fiscalZip ?? "",
    billingEmail: account?.billingEmail ?? "",
    homeDetailCenterId: account?.homeDetailCenterId ?? defaultCenterId,
    status: account?.status ?? "activa",
    notes: account?.notes ?? "",
    reason: account ? "" : "Alta de cuenta B2B",
  });
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  if (!account && companies?.length === 0)
    return <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.noCompanies}</Text>;
  const command = { ...v, id: account?.id, requestId } as Parameters<Repo["upsertAccount"]>[0];
  return (
    <View style={styles.stack}>
      {account ? null : (
        <Select
          label={b2bCopy.client}
          placeholder={b2bCopy.chooseClient}
          options={(companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
          value={v.clientId}
          onChange={(id) =>
            setV((s) => ({
              ...s,
              clientId: id,
              name: s.name || (companies?.find((c) => c.id === id)?.name ?? ""),
            }))
          }
          error={fields.clientId}
        />
      )}
      <Field label={b2bCopy.name} required value={v.name} onChangeText={set("name")} error={fields.name} />
      <Field label={b2bCopy.legalName} value={v.legalName} onChangeText={set("legalName")} />
      <Field
        label={b2bCopy.rfc}
        value={v.rfc}
        onChangeText={set("rfc")}
        autoCapitalize="characters"
        error={fields.rfc}
      />
      <Field
        label={b2bCopy.taxRegime}
        value={v.taxRegime}
        onChangeText={set("taxRegime")}
        keyboardType="number-pad"
        error={fields.taxRegime}
      />
      <Field
        label={b2bCopy.fiscalZip}
        value={v.fiscalZip}
        onChangeText={set("fiscalZip")}
        keyboardType="number-pad"
        error={fields.fiscalZip}
      />
      <Field
        label={b2bCopy.billingEmail}
        value={v.billingEmail}
        onChangeText={set("billingEmail")}
        keyboardType="email-address"
        autoCapitalize="none"
        error={fields.billingEmail}
      />
      <Select
        label={b2bCopy.homeCenter}
        options={centers.map((c) => ({ value: c.id, label: c.name }))}
        value={v.homeDetailCenterId}
        onChange={set("homeDetailCenterId")}
      />
      <Select
        label={b2bCopy.status}
        options={B2B_ACCOUNT_STATUSES.map((s) => ({ value: s, label: B2B_ACCOUNT_STATUS_LABELS[s] }))}
        value={v.status}
        onChange={set("status")}
      />
      <Field label={b2bCopy.notes} value={v.notes} onChangeText={set("notes")} />
      {account ? (
        <Field
          label={b2bCopy.reason}
          required
          value={v.reason}
          onChangeText={set("reason")}
          error={fields.reason}
        />
      ) : null}
      <Notice tone="danger" text={error} />
      <Button
        label={account ? b2bCopy.saveAccount : b2bCopy.createAccount}
        loading={busy}
        onPress={() =>
          void submit(
            b2bAccountSchema,
            command,
            (repo) => repo.upsertAccount(command),
            (d) => onSaved(d.id),
          )
        }
      />
    </View>
  );
}

export function ContactEditor({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const { busy, error, fields, submit } = useSubmit();
  const blank = { fullName: "", title: "", phone: "", email: "", reason: "" };
  const [v, setV] = useState(blank);
  const [primary, setPrimary] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return (
    <View style={styles.stack}>
      <Field
        label={b2bCopy.contactName}
        required
        value={v.fullName}
        onChangeText={set("fullName")}
        error={fields.fullName}
      />
      <Field label={b2bCopy.contactTitle} value={v.title} onChangeText={set("title")} />
      <Field
        label={b2bCopy.contactPhone}
        value={v.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
        error={fields.phone}
      />
      <Field
        label={b2bCopy.contactEmail}
        value={v.email}
        onChangeText={set("email")}
        autoCapitalize="none"
        error={fields.email}
      />
      <Checkbox label={b2bCopy.contactPrimary} checked={primary} onChange={setPrimary} />
      <Field
        label={b2bCopy.reason}
        required
        value={v.reason}
        onChangeText={set("reason")}
        error={fields.reason}
      />
      <Notice tone="danger" text={error} />
      <Button
        label={b2bCopy.addContact}
        variant="secondary"
        loading={busy}
        onPress={() =>
          void submit(
            b2bContactSchema,
            { ...v, accountId, isPrimary: primary, active: true },
            (repo) => repo.upsertContact({ ...v, accountId, isPrimary: primary, active: true }),
            () => {
              setV(blank);
              onDone();
            },
          )
        }
      />
    </View>
  );
}

export function VehicleToggle({
  accountId,
  vehicle,
  onDone,
}: {
  accountId: string;
  vehicle: B2bVehicle;
  onDone: () => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ costCenter: "", driverName: "", reason: "" });
  const label = vehicle.authorized ? b2bCopy.revoke : b2bCopy.authorize;
  if (!open) return <Button label={label} variant="secondary" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.stack}>
      {vehicle.authorized ? null : (
        <>
          <Field
            label={b2bCopy.costCenter}
            value={v.costCenter}
            onChangeText={(x) => setV((s) => ({ ...s, costCenter: x }))}
          />
          <Field
            label={b2bCopy.driver}
            value={v.driverName}
            onChangeText={(x) => setV((s) => ({ ...s, driverName: x }))}
          />
        </>
      )}
      <Field
        label={b2bCopy.reason}
        required
        value={v.reason}
        onChangeText={(x) => setV((s) => ({ ...s, reason: x }))}
        error={fields.reason}
      />
      <Notice tone="danger" text={error} />
      <Button
        label={label}
        variant={vehicle.authorized ? "danger" : "primary"}
        loading={busy}
        onPress={() =>
          void submit(
            b2bVehicleSchema,
            { ...v, accountId, vehicleId: vehicle.vehicleId, active: !vehicle.authorized },
            (repo) =>
              repo.setVehicle({ ...v, accountId, vehicleId: vehicle.vehicleId, active: !vehicle.authorized }),
            () => {
              setOpen(false);
              onDone();
            },
          )
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Convenio y tarifas
// ---------------------------------------------------------------------------

export function AgreementEditor({
  accountId,
  agreement,
  centers,
  today,
  onSaved,
}: {
  accountId: string;
  agreement?: B2bAgreement;
  centers: { id: string; name: string }[];
  today: string;
  onSaved: (id: string) => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const [requestId] = useState(newRequestId);
  const [v, setV] = useState({
    name: agreement?.name ?? "",
    billingModel: (agreement?.billingModel ?? "por_vehiculo") as BillingModel,
    startsOn: agreement?.startsOn ?? today,
    endsOn: agreement?.endsOn ?? "",
    status: agreement?.status ?? "activo",
    vehicleRule: agreement?.vehicleRule ?? "lista",
    paymentTermsDays: String(agreement?.paymentTermsDays ?? 30),
    creditLimit: agreement?.creditLimit != null ? String(agreement.creditLimit) : "",
    feeAmount: agreement?.feeAmount != null ? String(agreement.feeAmount) : "",
    includedUnits: agreement?.includedUnits != null ? String(agreement.includedUnits) : "",
    notes: agreement?.notes ?? "",
    reason: "",
  });
  const [centerIds, setCenterIds] = useState<string[]>(agreement?.centerIds ?? centers.map((c) => c.id));
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const withFee = FEE_MODELS.includes(v.billingModel);
  const command = { ...v, accountId, id: agreement?.id, requestId, centerIds } as unknown as Parameters<
    Repo["upsertAgreement"]
  >[0];
  return (
    <View style={styles.stack}>
      <Field
        label={b2bCopy.agreementName}
        required
        value={v.name}
        onChangeText={set("name")}
        error={fields.name}
      />
      <Select
        label={b2bCopy.billingModel}
        hint={BILLING_MODEL_HINTS[v.billingModel]}
        options={BILLING_MODELS.map((m) => ({ value: m, label: BILLING_MODEL_LABELS[m] }))}
        value={v.billingModel}
        onChange={set("billingModel")}
      />
      <Field
        label={`${b2bCopy.startsOn} (AAAA-MM-DD)`}
        value={v.startsOn}
        onChangeText={set("startsOn")}
        error={fields.startsOn}
      />
      <Field
        label={`${b2bCopy.endsOn} (AAAA-MM-DD)`}
        value={v.endsOn}
        onChangeText={set("endsOn")}
        error={fields.endsOn}
      />
      <Select
        label={b2bCopy.agreementStatus}
        options={AGREEMENT_STATUSES.map((s) => ({ value: s, label: AGREEMENT_STATUS_LABELS[s] }))}
        value={v.status}
        onChange={set("status")}
      />
      <Select
        label={b2bCopy.vehicleRule}
        options={VEHICLE_RULES.map((r) => ({ value: r, label: VEHICLE_RULE_LABELS[r] }))}
        value={v.vehicleRule}
        onChange={set("vehicleRule")}
      />
      <Field
        label={b2bCopy.paymentTerms}
        value={v.paymentTermsDays}
        onChangeText={set("paymentTermsDays")}
        keyboardType="number-pad"
        error={fields.paymentTermsDays}
      />
      <Field
        label={b2bCopy.creditLimit}
        value={v.creditLimit}
        onChangeText={set("creditLimit")}
        keyboardType="decimal-pad"
        error={fields.creditLimit}
      />
      {withFee ? (
        <>
          <Field
            label={b2bCopy.feeAmount}
            required
            value={v.feeAmount}
            onChangeText={set("feeAmount")}
            keyboardType="decimal-pad"
            error={fields.feeAmount}
          />
          <Field
            label={b2bCopy.includedUnits}
            required
            value={v.includedUnits}
            onChangeText={set("includedUnits")}
            keyboardType="number-pad"
            error={fields.includedUnits}
          />
        </>
      ) : null}
      <Text style={textStyle("label")}>{b2bCopy.centers}</Text>
      {centers.map((c) => (
        <Checkbox
          key={c.id}
          label={c.name}
          checked={centerIds.includes(c.id)}
          onChange={(on) => setCenterIds((ids) => (on ? [...ids, c.id] : ids.filter((x) => x !== c.id)))}
        />
      ))}
      {fields.centerIds ? <Notice tone="danger" text={fields.centerIds} /> : null}
      <Field label={b2bCopy.notes} value={v.notes} onChangeText={set("notes")} />
      <Field
        label={b2bCopy.reason}
        required
        value={v.reason}
        onChangeText={set("reason")}
        error={fields.reason}
      />
      <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.agreementExpiredHint}</Text>
      <Notice tone="danger" text={error} />
      <Button
        label={b2bCopy.saveAgreement}
        loading={busy}
        onPress={() =>
          void submit(
            b2bAgreementSchema,
            command,
            (repo) => repo.upsertAgreement(command),
            (d) => onSaved(d.id),
          )
        }
      />
    </View>
  );
}

export function PriceRuleEditor({
  agreementId,
  services,
  model,
  onDone,
}: {
  agreementId: string;
  services: CatalogItem[];
  model: BillingModel;
  onDone: () => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const kinds = PRICE_RULE_KINDS.filter((k) => k !== "incluido" || FEE_MODELS.includes(model));
  const [v, setV] = useState({
    serviceId: "",
    kind: "precio_fijo",
    value: "",
    minMonthlyOrders: "0",
    reason: "",
  });
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const command = { ...v, agreementId, active: true } as unknown as Parameters<Repo["setPriceRule"]>[0];
  return (
    <View style={styles.stack}>
      <Select
        label={b2bCopy.ruleService}
        options={[
          { value: "", label: b2bCopy.allServices },
          ...services.map((s) => ({ value: s.id, label: `${s.name} · ${formatMoney(s.price)}` })),
        ]}
        value={v.serviceId}
        onChange={set("serviceId")}
      />
      <Select
        label={b2bCopy.ruleKind}
        options={kinds.map((k) => ({ value: k, label: PRICE_RULE_KIND_LABELS[k] }))}
        value={v.kind}
        onChange={set("kind")}
      />
      {v.kind === "incluido" ? null : (
        <Field
          label={b2bCopy.ruleValue}
          value={v.value}
          onChangeText={set("value")}
          keyboardType="decimal-pad"
          error={fields.value}
        />
      )}
      {model === "volumen_mensual" ? (
        <Field
          label={b2bCopy.ruleMinVolume}
          value={v.minMonthlyOrders}
          onChangeText={set("minMonthlyOrders")}
          keyboardType="number-pad"
        />
      ) : null}
      <Field
        label={b2bCopy.reason}
        required
        value={v.reason}
        onChangeText={set("reason")}
        error={fields.reason}
      />
      <Notice tone="danger" text={error} />
      <Button
        label={b2bCopy.addRule}
        variant="secondary"
        loading={busy}
        onPress={() =>
          void submit(
            b2bPriceRuleSchema,
            command,
            (repo) => repo.setPriceRule(command),
            () => {
              setV((s) => ({ ...s, value: "", reason: "" }));
              onDone();
            },
          )
        }
      />
    </View>
  );
}

/** Acción con motivo (desactivar tarifa). */
export function ReasonAction({
  label,
  run,
  onDone,
}: {
  label: string;
  run: (repo: Repo, reason: string) => Promise<Result<void>>;
  onDone: () => void;
}) {
  const { busy, error, submit } = useSubmit();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <Button label={label} variant="secondary" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.stack}>
      <Field label={b2bCopy.reason} required value={reason} onChangeText={setReason} />
      <Notice tone="danger" text={error} />
      <Button
        label={label}
        variant="danger"
        loading={busy}
        onPress={() =>
          void submit(
            null,
            null,
            (repo) => run(repo, reason),
            () => {
              setOpen(false);
              setReason("");
              onDone();
            },
          )
        }
      />
    </View>
  );
}

export const toggleRule = (rule: B2bPriceRule) => (repo: Repo, reason: string) =>
  repo.setPriceRule({
    agreementId: rule.agreementId,
    id: rule.id,
    serviceId: rule.serviceId ?? undefined,
    kind: rule.kind,
    value: rule.value ?? undefined,
    minMonthlyOrders: rule.minMonthlyOrders,
    active: !rule.active,
    reason,
  });

// ---------------------------------------------------------------------------
// OS
// ---------------------------------------------------------------------------

/** OS a cuenta B2B (equivale a NewB2bOrderForm de web). */
export function NewB2bOrderEditor({
  centerId,
  accounts,
  services,
  onCreated,
}: {
  centerId: string;
  accounts: B2bAccountForOrder[];
  services: CatalogItem[];
  onCreated: (id: string) => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const [requestId] = useState(newRequestId);
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0]!.accountId : "");
  const account = accounts.find((a) => a.accountId === accountId);
  const [vehicleId, setVehicleId] = useState("");
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  if (accounts.length === 0) return <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.noAccounts}</Text>;
  const items = Object.entries(qty)
    .filter(([, q]) => q.trim() !== "" && q.trim() !== "0")
    .map(([serviceId, quantity]) => ({ serviceId, quantity: Number(quantity) }));
  return (
    <View style={styles.stack}>
      <Select
        label={b2bCopy.orderAccount}
        placeholder={b2bCopy.chooseAccount}
        options={accounts.map((a) => ({
          value: a.accountId,
          label: `${a.accountName} · ${a.agreementName}`,
        }))}
        value={accountId}
        onChange={(x) => {
          setAccountId(x);
          setVehicleId("");
        }}
        error={fields.accountId}
      />
      {account ? (
        <Text style={textStyle("bodySmall", "muted")}>
          {BILLING_MODEL_LABELS[account.billingModel]} · {VEHICLE_RULE_LABELS[account.vehicleRule]}
        </Text>
      ) : null}
      <Select
        label="Vehículo"
        placeholder="Elige el vehículo"
        options={(account?.vehicles ?? []).map((v) => ({
          value: v.id,
          label: `${v.make} ${v.model} ${v.year} · ${v.plate}`,
        }))}
        value={vehicleId}
        onChange={setVehicleId}
        error={fields.vehicleId}
      />
      <Field label={b2bCopy.purchaseOrder} value={purchaseOrder} onChangeText={setPurchaseOrder} />
      <Text style={textStyle("label")}>Servicios y productos</Text>
      <Text style={textStyle("caption", "muted")}>
        {b2bCopy.listPrice}: la tarifa del convenio se aplica al guardar.
      </Text>
      {services.map((s) => (
        <Field
          key={s.id}
          label={`${s.name} · ${formatMoney(s.price)}`}
          value={qty[s.id] ?? ""}
          onChangeText={(x) => setQty((q) => ({ ...q, [s.id]: x }))}
          keyboardType="number-pad"
          placeholder="0"
        />
      ))}
      {fields.items ? <Notice tone="danger" text={fields.items} /> : null}
      <Notice tone="danger" text={error} />
      <Button
        label="Abrir OS a cuenta"
        loading={busy}
        onPress={() =>
          void submit(
            createB2bOrderSchema,
            { detailCenterId: centerId, requestId, accountId, vehicleId, items, purchaseOrder },
            (repo) =>
              repo.createOrder({
                detailCenterId: centerId,
                requestId,
                accountId,
                vehicleId,
                items,
                purchaseOrder,
              }),
            (d) => onCreated(d.id),
          )
        }
      />
    </View>
  );
}

export function ApplyB2bEditor({
  orderId,
  version,
  accounts,
  purchaseOrder,
  onDone,
}: {
  orderId: string;
  version: number;
  accounts: B2bAccountForOrder[];
  purchaseOrder: string | null;
  onDone: () => void;
}) {
  const { busy, error, submit } = useSubmit();
  const [accountId, setAccountId] = useState(accounts[0]?.accountId ?? "");
  const [po, setPo] = useState(purchaseOrder ?? "");
  return (
    <View style={styles.stack}>
      <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.applyHint}</Text>
      <Select
        label={b2bCopy.orderAccount}
        options={accounts.map((a) => ({
          value: a.accountId,
          label: `${a.accountName} · ${a.agreementName}`,
        }))}
        value={accountId}
        onChange={setAccountId}
      />
      <Field label={b2bCopy.purchaseOrder} value={po} onChangeText={setPo} />
      <Notice tone="danger" text={error} />
      <Button
        label={b2bCopy.applyAccount}
        loading={busy}
        onPress={() =>
          void submit(null, null, (repo) => repo.applyAccount(orderId, version, accountId, po), onDone)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: space.sm } });
