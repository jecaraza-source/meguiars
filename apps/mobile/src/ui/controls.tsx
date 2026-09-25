import {
  buttonRecipes,
  colorOf,
  colors,
  controlSizes,
  radius,
  space,
  states,
  touchTarget,
  type ButtonContract,
  type FieldContract,
  type SelectContract,
} from "@meguiars/ui-tokens";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Sheet } from "./overlay";
import { textStyle } from "./theme";

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  onPress,
}: ButtonContract & { onPress: () => void }) {
  const recipe = buttonRecipes[variant];
  const inactive = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      // El tamaño compacto conserva el área táctil mínima con hitSlop.
      hitSlop={size === "sm" ? (touchTarget - controlSizes.sm.height) / 2 : 0}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: controlSizes[size].height,
          paddingHorizontal: controlSizes[size].paddingX,
          backgroundColor: colorOf(recipe.bg),
          borderColor: colorOf(recipe.border),
          opacity: inactive ? states.disabledOpacity : pressed ? states.pressedOpacity : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colorOf(recipe.fg)} />
      ) : (
        <Text style={[textStyle("label"), { color: colorOf(recipe.fg) }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Enlace de texto con área táctil completa. */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.link}>
      <Text style={[textStyle("bodySmall"), styles.underline]}>{label}</Text>
    </Pressable>
  );
}

function FieldShell({ label, hint, error, children }: FieldContract & { children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={textStyle("label")}>{label}</Text>
      {children}
      {hint ? <Text style={textStyle("caption", "muted")}>{hint}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={textStyle("caption", "danger")}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Field({ label, hint, error, required, ...props }: FieldContract & TextInputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.subtle}
        style={[styles.input, textStyle("body"), error ? { borderColor: colors.danger } : null]}
        {...props}
      />
    </FieldShell>
  );
}

/** Select nativo: abre una hoja con las opciones (una fila táctil por opción). */
export function Select({
  label,
  hint,
  error,
  options,
  value,
  placeholder = "Elige una opción",
  onChange,
}: SelectContract & { onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={[styles.input, styles.select]}
      >
        <Text style={textStyle("body", selected ? "foreground" : "subtle")}>
          {selected?.label ?? placeholder}
        </Text>
        <Text style={textStyle("body", "muted")}>▾</Text>
      </Pressable>
      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: o.value === value }}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            style={styles.option}
          >
            <Text style={textStyle(o.value === value ? "label" : "body")}>{o.label}</Text>
          </Pressable>
        ))}
      </Sheet>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.md,
  },
  link: { minHeight: touchTarget, justifyContent: "center" },
  underline: { textDecorationLine: "underline" },
  field: { gap: space.xs },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceRaised,
  },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  option: {
    minHeight: touchTarget,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
