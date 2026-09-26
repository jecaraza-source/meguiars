import { catalogCopy, REVENUE_ENGINE_LABELS, REVENUE_ENGINES } from "@meguiars/domain";
import { Field, Select } from "@/ui/controls";
import type { FieldErrors, FormValues } from "./ClientFields";

/** Campos del servicio homologado (mismos que el formulario web). */
export function ServiceFields({
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
        label={catalogCopy.nameLabel}
        required
        value={values.name ?? ""}
        onChangeText={(v) => set("name", v)}
        error={errors.name}
      />
      <Select
        label={catalogCopy.engineLabel}
        placeholder="Elige el motor"
        options={REVENUE_ENGINES.map((e) => ({ value: e, label: REVENUE_ENGINE_LABELS[e] }))}
        value={values.revenueEngine ?? ""}
        onChange={(v) => set("revenueEngine", v)}
        error={errors.revenueEngine}
      />
      <Field
        label={catalogCopy.durationLabel}
        required
        keyboardType="number-pad"
        value={values.standardDurationMinutes ?? ""}
        onChangeText={(v) => set("standardDurationMinutes", v)}
        error={errors.standardDurationMinutes}
      />
      <Field
        label={catalogCopy.priceLabel}
        required
        keyboardType="decimal-pad"
        value={values.basePrice ?? ""}
        onChangeText={(v) => set("basePrice", v)}
        error={errors.basePrice}
      />
      <Field
        label={catalogCopy.costLabel}
        required
        keyboardType="decimal-pad"
        value={values.standardDirectCost ?? ""}
        onChangeText={(v) => set("standardDirectCost", v)}
        error={errors.standardDirectCost}
      />
      <Field
        label={catalogCopy.descriptionLabel}
        value={values.description ?? ""}
        onChangeText={(v) => set("description", v)}
        error={errors.description}
      />
    </>
  );
}
