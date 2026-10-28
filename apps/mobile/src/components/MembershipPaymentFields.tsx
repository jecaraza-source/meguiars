import {
  formatMoney,
  membershipPaymentMethods,
  membershipPaymentsCopy,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_RULES,
  paymentsCopy,
  summarizeMembershipTenders,
  type PaymentMethod,
} from "@meguiars/domain";
import { space } from "@meguiars/ui-tokens";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Field, LinkButton, Select } from "@/ui/controls";
import { textStyle } from "@/ui/theme";

interface TenderRow {
  method: PaymentMethod;
  amount: string;
  reference: string;
}

/** Lo que captura el cobro, listo para sellMembershipSchema / renewMembershipPaidSchema. */
export interface MembershipPaymentValues {
  tenders: TenderRow[];
  cashReceived: string;
  notes: string;
}

const parseAmount = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? 0 : n;
};

/** Estado del cobro de una membresía; se reinicia cuando cambia el precio. */
export function useMembershipPayment(price: number) {
  const fresh = (): MembershipPaymentValues => ({
    tenders: [
      { method: membershipPaymentMethods()[0] ?? "efectivo", amount: price.toFixed(2), reference: "" },
    ],
    cashReceived: "",
    notes: "",
  });
  const [state, setState] = useState({ price, values: fresh() });
  const values = state.price === price ? state.values : fresh();
  const setValues = (v: MembershipPaymentValues) => setState({ price, values: v });
  const hasCash = values.tenders.some((r) => PAYMENT_METHOD_RULES[r.method].allowsChange);
  const payload = { ...values, cashReceived: hasCash ? values.cashReceived : "" };
  return { values, setValues, payload };
}

/**
 * Cobro completo del precio al vender o renovar (equivale a la sección de cobro
 * del formulario web). La vista previa usa las reglas de la base (ADR 0043).
 */
export function MembershipPaymentFields({
  price,
  values,
  onChange,
}: {
  price: number;
  values: MembershipPaymentValues;
  onChange: (values: MembershipPaymentValues) => void;
}) {
  const allowed = membershipPaymentMethods();
  const rows = values.tenders;
  const hasCash = rows.some((r) => PAYMENT_METHOD_RULES[r.method].allowsChange);
  const preview = summarizeMembershipTenders(
    price,
    rows.map((r) => ({ method: r.method, amount: parseAmount(r.amount), reference: r.reference })),
    hasCash && values.cashReceived.trim() ? parseAmount(values.cashReceived) : null,
  );
  const setRows = (tenders: TenderRow[]) => onChange({ ...values, tenders });
  const update = (i: number, patch: Partial<TenderRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <View style={styles.form}>
      <Text style={textStyle("label")}>
        {membershipPaymentsCopy.paymentTitle} · {formatMoney(price)}
      </Text>
      {rows.map((r, i) => (
        <View key={i} style={styles.tender}>
          <Select
            label={paymentsCopy.method}
            options={allowed.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
            value={r.method}
            onChange={(v) => update(i, { method: v as PaymentMethod })}
          />
          <Field
            label={paymentsCopy.amount}
            keyboardType="decimal-pad"
            value={r.amount}
            onChangeText={(v) => update(i, { amount: v })}
          />
          <Field
            label={
              PAYMENT_METHOD_RULES[r.method].requiresReference
                ? paymentsCopy.reference
                : paymentsCopy.referenceOptional
            }
            value={r.reference}
            onChangeText={(v) => update(i, { reference: v })}
          />
          {rows.length > 1 ? (
            <LinkButton
              label={paymentsCopy.removeTender}
              onPress={() => setRows(rows.filter((_, j) => j !== i))}
            />
          ) : null}
        </View>
      ))}
      {rows.length < allowed.length ? (
        <LinkButton
          label={paymentsCopy.addTender}
          onPress={() =>
            setRows([
              ...rows,
              {
                method: allowed.find((m) => !rows.some((r) => r.method === m)) ?? allowed[0]!,
                amount: preview.remaining > 0 ? preview.remaining.toFixed(2) : "",
                reference: "",
              },
            ])
          }
        />
      ) : null}
      {hasCash ? (
        <Field
          label={paymentsCopy.cashReceived}
          hint={paymentsCopy.cashReceivedHint}
          keyboardType="decimal-pad"
          value={values.cashReceived}
          onChangeText={(v) => onChange({ ...values, cashReceived: v })}
        />
      ) : null}
      <Field
        label={paymentsCopy.notes}
        value={values.notes}
        onChangeText={(v) => onChange({ ...values, notes: v })}
        maxLength={500}
      />
      <Text style={textStyle("label")}>
        {paymentsCopy.amount} {formatMoney(preview.total)}
        {preview.change > 0 ? ` · ${paymentsCopy.change} ${formatMoney(preview.change)}` : ""}
      </Text>
      {preview.error ? <Text style={textStyle("bodySmall", "muted")}>{preview.error}</Text> : null}
      <Text style={textStyle("caption", "muted")}>{paymentsCopy.onlineOnly}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  tender: { gap: space.sm },
});
