import {
  BILLING_MODEL_LABELS,
  BILLING_MODELS,
  OPPORTUNITY_SOURCE_LABELS,
  OPPORTUNITY_SOURCES,
  pipelineCopy,
  proposalNeedsFee,
  VEHICLE_RULE_LABELS,
  VEHICLE_RULES,
  type BillingModel,
  type Opportunity,
  type PipelineOwner,
} from "@meguiars/domain";
import { space } from "@meguiars/ui-tokens";
import { StyleSheet, Text, View } from "react-native";
import { Field, Select } from "@/ui/controls";
import { textStyle } from "@/ui/theme";

/** Valores del formulario (texto, como los captura el usuario; zod normaliza). */
export type OpportunityValues = Record<
  | "title"
  | "estimatedValue"
  | "ownerId"
  | "source"
  | "nextAction"
  | "nextActionOn"
  | "expectedCloseOn"
  | "notes"
  | "companyName"
  | "legalName"
  | "rfc"
  | "contactName"
  | "contactTitle"
  | "contactPhone"
  | "contactEmail"
  | "billingModel"
  | "months"
  | "vehicleRule"
  | "paymentTermsDays"
  | "creditLimit"
  | "feeAmount"
  | "includedUnits",
  string
>;

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

export function initialOpportunityValues(o?: Opportunity, ownerId = ""): OpportunityValues {
  return {
    title: o?.title ?? "",
    estimatedValue: str(o?.estimatedValue),
    ownerId: o ? (o.ownerId ?? "") : ownerId,
    source: o?.source ?? "",
    nextAction: o?.nextAction ?? "",
    nextActionOn: o?.nextActionOn ?? "",
    expectedCloseOn: o?.expectedCloseOn ?? "",
    notes: o?.notes ?? "",
    companyName: o?.prospect.companyName ?? "",
    legalName: o?.prospect.legalName ?? "",
    rfc: o?.prospect.rfc ?? "",
    contactName: o?.prospect.contactName ?? "",
    contactTitle: o?.prospect.contactTitle ?? "",
    contactPhone: o?.prospect.contactPhone ?? "",
    contactEmail: o?.prospect.contactEmail ?? "",
    billingModel: o?.proposal.billingModel ?? "",
    months: str(o?.proposal.months ?? 12),
    vehicleRule: o?.proposal.vehicleRule ?? "cualquiera",
    paymentTermsDays: str(o?.proposal.paymentTermsDays ?? 30),
    creditLimit: str(o?.proposal.creditLimit),
    feeAmount: str(o?.proposal.feeAmount),
    includedUnits: str(o?.proposal.includedUnits),
  };
}

/** Prospecto y propuesta para el repositorio (el esquema zod los valida y normaliza). */
export function opportunityInput(v: OpportunityValues, b2b: boolean) {
  return {
    title: v.title,
    estimatedValue: v.estimatedValue,
    ownerId: v.ownerId,
    source: v.source,
    nextAction: v.nextAction,
    nextActionOn: v.nextActionOn,
    expectedCloseOn: v.expectedCloseOn,
    notes: v.notes,
    prospect: {
      companyName: v.companyName,
      legalName: v.legalName,
      rfc: v.rfc,
      contactName: v.contactName,
      contactTitle: v.contactTitle,
      contactPhone: v.contactPhone,
      contactEmail: v.contactEmail,
    },
    proposal: b2b
      ? {
          billingModel: v.billingModel,
          months: v.months,
          vehicleRule: v.vehicleRule,
          paymentTermsDays: v.paymentTermsDays,
          creditLimit: v.creditLimit,
          feeAmount: v.feeAmount,
          includedUnits: v.includedUnits,
        }
      : undefined,
  };
}

/** Datos del prospecto y propuesta de convenio (B2B), igual que en web. */
export function B2bOpportunityFields({
  v,
  set,
  errors,
  companyLocked = false,
}: {
  v: OpportunityValues;
  set: (k: keyof OpportunityValues) => (x: string) => void;
  errors: Record<string, string>;
  companyLocked?: boolean;
}) {
  return (
    <View style={styles.stack}>
      <Text style={textStyle("label")}>{pipelineCopy.prospectSection}</Text>
      <Text style={textStyle("caption", "muted")}>{pipelineCopy.prospectHint}</Text>
      <Field
        label={pipelineCopy.companyName}
        value={v.companyName}
        onChangeText={set("companyName")}
        editable={!companyLocked}
        error={errors.companyName}
      />
      <Field
        label={pipelineCopy.legalName}
        value={v.legalName}
        onChangeText={set("legalName")}
        error={errors.legalName}
      />
      <Field
        label={pipelineCopy.rfc}
        value={v.rfc}
        onChangeText={set("rfc")}
        autoCapitalize="characters"
        error={errors.rfc}
      />
      <Field
        label={pipelineCopy.contactName}
        value={v.contactName}
        onChangeText={set("contactName")}
        error={errors.contactName}
      />
      <Field
        label={pipelineCopy.contactTitle}
        value={v.contactTitle}
        onChangeText={set("contactTitle")}
        error={errors.contactTitle}
      />
      <Field
        label={pipelineCopy.contactPhone}
        value={v.contactPhone}
        onChangeText={set("contactPhone")}
        keyboardType="phone-pad"
        error={errors.contactPhone}
      />
      <Field
        label={pipelineCopy.contactEmail}
        value={v.contactEmail}
        onChangeText={set("contactEmail")}
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.contactEmail}
      />
      <Text style={textStyle("label")}>{pipelineCopy.proposalSection}</Text>
      <Text style={textStyle("caption", "muted")}>{pipelineCopy.proposalHint}</Text>
      <Select
        label={pipelineCopy.billingModel}
        options={[
          { value: "", label: pipelineCopy.noProposal },
          ...BILLING_MODELS.map((m) => ({ value: m, label: BILLING_MODEL_LABELS[m] })),
        ]}
        value={v.billingModel}
        onChange={set("billingModel")}
      />
      {v.billingModel ? (
        <>
          <Field
            label={pipelineCopy.months}
            value={v.months}
            onChangeText={set("months")}
            keyboardType="number-pad"
            error={errors.months}
          />
          <Select
            label={pipelineCopy.vehicleRule}
            options={VEHICLE_RULES.map((r) => ({ value: r, label: VEHICLE_RULE_LABELS[r] }))}
            value={v.vehicleRule}
            onChange={set("vehicleRule")}
          />
          <Field
            label={pipelineCopy.paymentTermsDays}
            value={v.paymentTermsDays}
            onChangeText={set("paymentTermsDays")}
            keyboardType="number-pad"
            error={errors.paymentTermsDays}
          />
          <Field
            label={pipelineCopy.creditLimit}
            value={v.creditLimit}
            onChangeText={set("creditLimit")}
            keyboardType="decimal-pad"
            error={errors.creditLimit}
          />
          {proposalNeedsFee(v.billingModel as BillingModel) ? (
            <>
              <Field
                label={pipelineCopy.feeAmount}
                value={v.feeAmount}
                onChangeText={set("feeAmount")}
                keyboardType="decimal-pad"
                error={errors.feeAmount}
              />
              <Field
                label={pipelineCopy.includedUnits}
                value={v.includedUnits}
                onChangeText={set("includedUnits")}
                keyboardType="number-pad"
                error={errors.includedUnits}
              />
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Campos comunes de alta y edición. */
export function CommonOpportunityFields({
  v,
  set,
  errors,
  owners,
}: {
  v: OpportunityValues;
  set: (k: keyof OpportunityValues) => (x: string) => void;
  errors: Record<string, string>;
  owners: PipelineOwner[];
}) {
  return (
    <View style={styles.stack}>
      <Field
        label={pipelineCopy.titleField}
        hint={pipelineCopy.titleHint}
        required
        value={v.title}
        onChangeText={set("title")}
        error={errors.title}
      />
      <Field
        label={pipelineCopy.estimatedValue}
        required
        value={v.estimatedValue}
        onChangeText={set("estimatedValue")}
        keyboardType="decimal-pad"
        error={errors.estimatedValue}
      />
      <Select
        label={pipelineCopy.owner}
        options={[
          { value: "", label: pipelineCopy.unassigned },
          ...owners.map((o) => ({ value: o.userId, label: o.fullName })),
        ]}
        value={v.ownerId}
        onChange={set("ownerId")}
        error={errors.ownerId}
      />
      <Select
        label={pipelineCopy.source}
        options={[
          { value: "", label: "—" },
          ...OPPORTUNITY_SOURCES.map((s) => ({ value: s, label: OPPORTUNITY_SOURCE_LABELS[s] })),
        ]}
        value={v.source}
        onChange={set("source")}
      />
      <Field
        label={pipelineCopy.nextAction}
        value={v.nextAction}
        onChangeText={set("nextAction")}
        error={errors.nextAction}
      />
      <Field
        label={`${pipelineCopy.nextActionOn} (AAAA-MM-DD)`}
        value={v.nextActionOn}
        onChangeText={set("nextActionOn")}
        error={errors.nextActionOn}
      />
      <Field
        label={`${pipelineCopy.expectedCloseOn} (AAAA-MM-DD)`}
        value={v.expectedCloseOn}
        onChangeText={set("expectedCloseOn")}
        error={errors.expectedCloseOn}
      />
      <Field label={pipelineCopy.notes} value={v.notes} onChangeText={set("notes")} error={errors.notes} />
    </View>
  );
}

/** Errores por campo con el nombre plano (prospect.contactPhone → contactPhone). */
export function flatErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path.at(-1) ?? "form");
    out[key] ??= i.message;
  }
  return out;
}

const styles = StyleSheet.create({ stack: { gap: space.md } });
