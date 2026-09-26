import {
  membershipErrorMessage,
  membershipsCopy,
  PERIOD_LABELS,
  PERIOD_MONTHS,
  PLAN_TIER_LABELS,
  PLAN_TIERS,
  REDEEM_SCOPE_LABELS,
  REDEEM_SCOPES,
  type CatalogItem,
  type MembershipPlan,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import { fieldErrors, membershipBenefitSchema, membershipPlanSchema } from "@meguiars/validation";
import { useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Field, Select } from "@/ui/controls";
import { Card } from "@/ui/display";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";

/** Alta (sin `plan`) o edición de un plan de membresía (admin corporativo). */
export function PlanFormCard({
  organizationId,
  plan,
  today,
  onSaved,
}: {
  organizationId: string;
  plan?: MembershipPlan;
  today: string;
  onSaved: (id: string) => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({
    code: plan?.code ?? "",
    tier: plan?.tier ?? "care",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price: plan ? String(plan.price) : "",
    periodMonths: String(plan?.periodMonths ?? 1),
    redeemScope: plan?.redeemScope ?? "centro_origen",
    restrictions: plan?.restrictions ?? "",
    renewalNoticeDays: String(plan?.renewalNoticeDays ?? 7),
    availableFrom: plan?.availableFrom ?? today,
    availableUntil: plan?.availableUntil ?? "",
    reason: "",
  });
  const [active, setActive] = useState(plan?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof v, value: string) => setV((s) => ({ ...s, [key]: value }));

  const save = async () => {
    if (!client) return;
    const parsed = membershipPlanSchema.safeParse({ ...v, organizationId, id: plan?.id, active });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await createMembershipRepository(client).upsertPlan(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(membershipErrorMessage(r.error));
    toast({ message: plan ? membershipsCopy.saved : membershipsCopy.planCreated, tone: "success" });
    onSaved(r.data.id);
  };

  return (
    <Card title={plan ? membershipsCopy.planSave : membershipsCopy.newPlan}>
      <Field
        label={membershipsCopy.planCode}
        required
        editable={!plan}
        value={v.code}
        onChangeText={(x) => set("code", x)}
        error={errors.code}
        autoCapitalize="characters"
      />
      <Select
        label={membershipsCopy.planTier}
        options={PLAN_TIERS.map((t) => ({ value: t, label: PLAN_TIER_LABELS[t] }))}
        value={v.tier}
        onChange={(x) => set("tier", x)}
        error={errors.tier}
      />
      <Field
        label={membershipsCopy.planName}
        required
        value={v.name}
        onChangeText={(x) => set("name", x)}
        error={errors.name}
      />
      <Field
        label={membershipsCopy.planDescription}
        value={v.description}
        onChangeText={(x) => set("description", x)}
      />
      <Field
        label={membershipsCopy.planPrice}
        required
        keyboardType="decimal-pad"
        value={v.price}
        onChangeText={(x) => set("price", x)}
        error={errors.price}
      />
      <Select
        label={membershipsCopy.planPeriod}
        options={PERIOD_MONTHS.map((m) => ({ value: String(m), label: PERIOD_LABELS[m]! }))}
        value={v.periodMonths}
        onChange={(x) => set("periodMonths", x)}
        error={errors.periodMonths}
      />
      <Select
        label={membershipsCopy.planScope}
        options={REDEEM_SCOPES.map((s) => ({ value: s, label: REDEEM_SCOPE_LABELS[s] }))}
        value={v.redeemScope}
        onChange={(x) => set("redeemScope", x)}
      />
      <Field
        label={membershipsCopy.planRestrictions}
        value={v.restrictions}
        onChangeText={(x) => set("restrictions", x)}
      />
      <Field
        label={membershipsCopy.planNotice}
        keyboardType="number-pad"
        value={v.renewalNoticeDays}
        onChangeText={(x) => set("renewalNoticeDays", x)}
        error={errors.renewalNoticeDays}
      />
      <Field
        label={`${membershipsCopy.planAvailableFrom} (AAAA-MM-DD)`}
        value={v.availableFrom}
        onChangeText={(x) => set("availableFrom", x)}
        error={errors.availableFrom}
      />
      <Field
        label={`${membershipsCopy.planAvailableUntil} (AAAA-MM-DD)`}
        value={v.availableUntil}
        onChangeText={(x) => set("availableUntil", x)}
        error={errors.availableUntil}
      />
      <Field
        label={membershipsCopy.reason}
        required
        value={v.reason}
        onChangeText={(x) => set("reason", x)}
        error={errors.reason}
      />
      <Checkbox label={membershipsCopy.planActive} checked={active} onChange={setActive} />
      <Notice tone="danger" text={error} />
      <Button
        label={plan ? membershipsCopy.planSave : membershipsCopy.newPlan}
        loading={busy}
        onPress={() => void save()}
      />
    </Card>
  );
}

export function BenefitsCard({
  plan,
  services,
  editable,
  onSaved,
}: {
  plan: MembershipPlan;
  services: CatalogItem[];
  editable: boolean;
  onSaved: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ serviceId: "", quantityPerPeriod: "1", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (remove: boolean, serviceId = form.serviceId) => {
    if (!client) return;
    const parsed = membershipBenefitSchema.safeParse({
      planId: plan.id,
      serviceId,
      quantityPerPeriod: remove ? "" : form.quantityPerPeriod,
      reason: form.reason,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await createMembershipRepository(client).setBenefit(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(membershipErrorMessage(r.error));
    toast({ message: membershipsCopy.saved, tone: "success" });
    onSaved();
  };

  return (
    <Card title={membershipsCopy.benefitsTitle} subtitle={membershipsCopy.benefitsHint}>
      {plan.benefits.length === 0 ? (
        <Text style={textStyle("bodySmall", "muted")}>{membershipsCopy.balanceEmpty}</Text>
      ) : null}
      {plan.benefits.map((b) => (
        <View key={b.id}>
          <Text style={textStyle("bodySmall")}>
            {b.serviceName} · {b.serviceCode} × {b.quantityPerPeriod}
          </Text>
          {editable ? (
            <Button
              label={membershipsCopy.benefitRemove}
              variant="secondary"
              size="sm"
              disabled={busy}
              onPress={() => void save(true, b.serviceId)}
            />
          ) : null}
        </View>
      ))}
      {editable ? (
        <>
          <Select
            label={membershipsCopy.benefitService}
            options={services.map((s) => ({ value: s.id, label: `${s.name} · ${s.code}` }))}
            value={form.serviceId}
            onChange={(x) => setForm((f) => ({ ...f, serviceId: x }))}
            placeholder="Elige"
            error={errors.serviceId}
          />
          <Field
            label={membershipsCopy.benefitQuantity}
            keyboardType="number-pad"
            value={form.quantityPerPeriod}
            onChangeText={(x) => setForm((f) => ({ ...f, quantityPerPeriod: x }))}
            error={errors.quantityPerPeriod}
          />
          <Field
            label={membershipsCopy.reason}
            required
            hint="También se pide para quitar un servicio."
            value={form.reason}
            onChangeText={(x) => setForm((f) => ({ ...f, reason: x }))}
            error={errors.reason}
          />
          <Button
            label={membershipsCopy.benefitSave}
            variant="secondary"
            loading={busy}
            onPress={() => void save(false)}
          />
        </>
      ) : null}
      <Notice tone="danger" text={error} />
    </Card>
  );
}
