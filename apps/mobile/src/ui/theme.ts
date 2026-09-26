import { colors, typography, type TypographyToken } from "@meguiars/ui-tokens";
import type { TextStyle } from "react-native";

/** Estilo de texto de React Native a partir de un token de tipografía. */
export function textStyle(token: TypographyToken, color: keyof typeof colors = "foreground"): TextStyle {
  const t = typography[token];
  return {
    fontSize: t.fontSize,
    fontWeight: t.fontWeight,
    lineHeight: Math.round(t.fontSize * t.lineHeight),
    color: colors[color],
  };
}
