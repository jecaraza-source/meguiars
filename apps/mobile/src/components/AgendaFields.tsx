import {
  agendaCopy,
  formatDuration,
  formatMoney,
  type Bay,
  type CatalogItem,
  type Technician,
} from "@meguiars/domain";
import { Text, View } from "react-native";
import { Checkbox, Field, Select } from "@/ui/controls";
import { textStyle } from "@/ui/theme";
import type { FieldErrors, FormValues } from "./ClientFields";

/** Servicios, duración, bahía, técnico y notas (mismos campos que la web). */
export function ScheduleFields({
  values,
  errors,
  set,
  serviceIds,
  setServiceIds,
  services,
  bays,
  technicians,
}: {
  values: FormValues;
  errors: FieldErrors;
  set: (key: string, value: string) => void;
  serviceIds: string[];
  setServiceIds: (ids: string[]) => void;
  services: CatalogItem[];
  bays: Bay[];
  technicians: Technician[];
}) {
  const none = { value: "", label: agendaCopy.none };
  return (
    <>
      <View>
        <Text style={textStyle("label")}>{agendaCopy.servicesLabel} *</Text>
        {services.map((s) => (
          <Checkbox
            key={s.id}
            label={`${s.name} · ${formatDuration(s.standardDurationMinutes)} · ${formatMoney(s.price)}`}
            checked={serviceIds.includes(s.id)}
            onChange={(on) =>
              setServiceIds(on ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))
            }
          />
        ))}
        {errors.serviceIds ? (
          <Text accessibilityRole="alert" style={textStyle("caption", "danger")}>
            {errors.serviceIds}
          </Text>
        ) : null}
      </View>
      <Field
        label={agendaCopy.durationLabel}
        hint={agendaCopy.durationHint}
        keyboardType="number-pad"
        value={values.durationMinutes ?? ""}
        onChangeText={(v) => set("durationMinutes", v)}
        error={errors.durationMinutes}
      />
      <Select
        label={agendaCopy.bayLabel}
        options={[none, ...bays.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]}
        value={values.bayId ?? ""}
        onChange={(v) => set("bayId", v)}
      />
      <Select
        label={agendaCopy.technicianLabel}
        options={[
          none,
          ...technicians.filter((t) => t.active).map((t) => ({ value: t.id, label: t.fullName })),
        ]}
        value={values.technicianId ?? ""}
        onChange={(v) => set("technicianId", v)}
      />
      <Field label={agendaCopy.notesLabel} value={values.notes ?? ""} onChangeText={(v) => set("notes", v)} />
    </>
  );
}

/** Fecha y hora del centro (texto: AAAA-MM-DD y HH:MM, sin dependencias nativas). */
export function DateTimeFields({
  values,
  errors,
  set,
}: {
  values: FormValues;
  errors: FieldErrors;
  set: (key: string, value: string) => void;
}) {
  return (
    <>
      <Field
        label={`${agendaCopy.dateLabel} (AAAA-MM-DD)`}
        required
        keyboardType="numbers-and-punctuation"
        value={values.date ?? ""}
        onChangeText={(v) => set("date", v)}
        error={errors.date}
      />
      <Field
        label={`${agendaCopy.timeLabel} (HH:MM)`}
        required
        keyboardType="numbers-and-punctuation"
        value={values.time ?? ""}
        onChangeText={(v) => set("time", v)}
        error={errors.time}
      />
    </>
  );
}
