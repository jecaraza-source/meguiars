import { colors, fontSize, fontWeight, radius, space } from "@meguiars/ui-tokens";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | undefined }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: "primary" | "link";
}) {
  if (variant === "link") {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
        <Text style={styles.linkText}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
      disabled={busy}
      onPress={onPress}
      style={[styles.button, busy ? { opacity: 0.6 } : null]}
    >
      {busy ? (
        <ActivityIndicator color={colors.brandForeground} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Message({
  text,
  tone = "muted",
}: {
  text: string | null | undefined;
  tone?: "muted" | "danger" | "success" | "warning";
}) {
  if (!text) return null;
  return (
    <Text
      accessibilityRole={tone === "danger" ? "alert" : "text"}
      style={[styles.message, { color: colors[tone] }]}
    >
      {text}
    </Text>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export const text = StyleSheet.create({
  body: { fontSize: fontSize.md, color: colors.foreground },
  muted: { fontSize: fontSize.sm, color: colors.muted },
  strong: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground },
  section: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: space.md,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.xl, gap: space.lg },
  eyebrow: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.accent },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.foreground },
  field: { gap: space.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    color: colors.foreground,
  },
  error: { fontSize: fontSize.sm, color: colors.danger },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
  },
  buttonText: { color: colors.brandForeground, fontWeight: fontWeight.semibold, fontSize: fontSize.md },
  link: { paddingVertical: space.xs },
  linkText: { color: colors.foreground, textDecorationLine: "underline", fontSize: fontSize.sm },
  message: { fontSize: fontSize.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
});
