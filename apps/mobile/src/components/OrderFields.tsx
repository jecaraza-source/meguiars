import {
  CHANNEL_REFERENCE_LABELS,
  formatDuration,
  formatMoney,
  ordersCopy,
  SALES_CHANNEL_LABELS,
  SALES_CHANNELS,
  type CatalogItem,
  type SalesChannel,
} from "@meguiars/domain";
import { StyleSheet, Text, View } from "react-native";
import { space } from "@meguiars/ui-tokens";
import { Field, Select } from "@/ui/controls";
import { textStyle } from "@/ui/theme";
import type { FieldErrors, FormValues } from "./ClientFields";

/** Canal y su referencia (membresía / orden de compra), como en la web. */
export function ChannelFields({
  values,
  errors,
  set,
}: {
  values: FormValues;
  errors: FieldErrors;
  set: (key: string, value: string) => void;
}) {
  const channel = (values.channel || "b2c") as SalesChannel;
  return (
    <>
      <Select
        label={ordersCopy.channelLabel}
        options={SALES_CHANNELS.map((c) => ({ value: c, label: SALES_CHANNEL_LABELS[c] }))}
        value={channel}
        onChange={(v) => set("channel", v)}
        error={errors.channel}
      />
      <Field
        label={CHANNEL_REFERENCE_LABELS[channel]}
        value={values.channelReference ?? ""}
        onChangeText={(v) => set("channelReference", v)}
        error={errors.channelReference}
      />
    </>
  );
}

/** Cantidad por servicio/producto del catálogo ("" = no incluido); mismo modelo que la web. */
export function QuantityFields({
  services,
  quantities,
  setQuantity,
  error,
}: {
  services: CatalogItem[];
  quantities: Record<string, string>;
  setQuantity: (serviceId: string, quantity: string) => void;
  error?: string | undefined;
}) {
  return (
    <View>
      <Text style={textStyle("label")}>{ordersCopy.itemsLabel} *</Text>
      {services.map((s) => (
        <View key={s.id} style={styles.row}>
          <Text style={[textStyle("bodySmall"), styles.name]}>
            {s.name} · {formatDuration(s.standardDurationMinutes)} · {formatMoney(s.price)}
          </Text>
          <View style={styles.qty}>
            <Field
              label={ordersCopy.quantity}
              keyboardType="number-pad"
              placeholder="0"
              value={quantities[s.id] ?? ""}
              onChangeText={(v) => setQuantity(s.id, v)}
            />
          </View>
        </View>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={textStyle("caption", "danger")}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  name: { flex: 1, paddingBottom: space.md },
  qty: { width: space.xxxl * 2 },
});
