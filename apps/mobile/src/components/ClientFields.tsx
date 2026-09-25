import {
  CLIENT_KIND_LABELS,
  CLIENT_KINDS,
  clientsCopy,
  MARKETING_CHANNEL_LABELS,
  MARKETING_CHANNELS,
  type MarketingChannel,
} from "@meguiars/domain";
import { Text, View } from "react-native";
import { Checkbox, Field, Select } from "@/ui/controls";
import { textStyle } from "@/ui/theme";

/** Valores de formulario como texto (igual que FormData en web). */
export type FormValues = Record<string, string>;
export type FieldErrors = Record<string, string | undefined>;

interface FieldsProps {
  values: FormValues;
  errors: FieldErrors;
  set: (key: string, value: string) => void;
}

export const kindOptions = CLIENT_KINDS.map((k) => ({ value: k, label: CLIENT_KIND_LABELS[k] }));

export function ClientFields({ values, errors, set }: FieldsProps) {
  return (
    <>
      <Field
        label={clientsCopy.fullNameLabel}
        required
        value={values.fullName ?? ""}
        onChangeText={(v) => set("fullName", v)}
        autoComplete="name"
        error={errors.fullName}
      />
      <Select
        label={clientsCopy.kindLabel}
        options={kindOptions}
        value={values.kind ?? "person"}
        onChange={(v) => set("kind", v)}
      />
      <Field
        label={clientsCopy.phoneLabel}
        hint={clientsCopy.phoneHint}
        required
        keyboardType="phone-pad"
        autoComplete="tel"
        value={values.phone ?? ""}
        onChangeText={(v) => set("phone", v)}
        error={errors.phone}
      />
      <Field
        label={clientsCopy.emailLabel}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={values.email ?? ""}
        onChangeText={(v) => set("email", v)}
        error={errors.email}
      />
      <Field
        label={clientsCopy.notesLabel}
        value={values.notes ?? ""}
        onChangeText={(v) => set("notes", v)}
        error={errors.notes}
      />
    </>
  );
}

export function ConsentFields({
  channels,
  onChange,
}: {
  channels: MarketingChannel[];
  onChange: (channels: MarketingChannel[]) => void;
}) {
  return (
    <View accessibilityRole="none">
      <Text style={textStyle("label")}>{clientsCopy.consentLabel}</Text>
      {MARKETING_CHANNELS.map((c) => (
        <Checkbox
          key={c}
          label={MARKETING_CHANNEL_LABELS[c]}
          checked={channels.includes(c)}
          onChange={(on) => onChange(on ? [...channels, c] : channels.filter((x) => x !== c))}
        />
      ))}
      <Text style={textStyle("caption", "muted")}>{clientsCopy.consentHint}</Text>
    </View>
  );
}

export function VehicleFields({ values, errors, set }: FieldsProps) {
  return (
    <>
      <Field
        label={clientsCopy.makeLabel}
        required
        value={values.make ?? ""}
        onChangeText={(v) => set("make", v)}
        error={errors.make}
      />
      <Field
        label={clientsCopy.modelLabel}
        required
        value={values.model ?? ""}
        onChangeText={(v) => set("model", v)}
        error={errors.model}
      />
      <Field
        label={clientsCopy.yearLabel}
        required
        keyboardType="number-pad"
        value={values.year ?? ""}
        onChangeText={(v) => set("year", v)}
        error={errors.year}
      />
      <Field
        label={clientsCopy.plateLabel}
        required
        autoCapitalize="characters"
        autoCorrect={false}
        value={values.plate ?? ""}
        onChangeText={(v) => set("plate", v)}
        error={errors.plate}
      />
      <Field
        label={clientsCopy.identifierLabel}
        hint={clientsCopy.identifierHint}
        autoCapitalize="characters"
        autoCorrect={false}
        value={values.identifier ?? ""}
        onChangeText={(v) => set("identifier", v)}
        error={errors.identifier}
      />
      <Field
        label={clientsCopy.vehicleNotesLabel}
        value={values.vehicleNotes ?? ""}
        onChangeText={(v) => set("vehicleNotes", v)}
        error={errors.vehicleNotes ?? errors.notes}
      />
    </>
  );
}
