import { colorOf, radius, space, toneRecipes, type Tone } from "@meguiars/ui-tokens";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "./theme";

/** Mensaje en línea (error de formulario, confirmación); equivale al aviso .mg-tone de web. */
export function Notice({ text, tone = "neutral" }: { text: string | null | undefined; tone?: Tone }) {
  if (!text) return null;
  const r = toneRecipes[tone];
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : "text"}
      style={[styles.notice, { backgroundColor: colorOf(r.bg), borderColor: colorOf(r.border) }]}
    >
      <Text style={[textStyle("bodySmall"), { color: colorOf(r.fg) }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
});
