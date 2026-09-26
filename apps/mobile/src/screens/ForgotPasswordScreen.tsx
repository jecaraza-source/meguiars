import { APP_NAME, authCopy } from "@meguiars/domain";
import { fieldErrors, forgotPasswordSchema } from "@meguiars/validation";
import { useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";

export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const { sendReset } = useAuth();
  const [email, setEmail] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    setFields({});
    setBusy(true);
    const res = await sendReset(parsed.data.email);
    setBusy(false);
    // Mismo mensaje exista o no el correo.
    setResult(
      res.ok ? { tone: "success", text: authCopy.forgotSent } : { tone: "danger", text: res.error.message },
    );
  };

  return (
    <Screen eyebrow={APP_NAME.toUpperCase()} title={authCopy.forgotTitle}>
      <Text style={textStyle("bodySmall", "muted")}>{authCopy.forgotHelp}</Text>
      <Field
        label={authCopy.emailLabel}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        error={fields.email}
      />
      <Notice tone={result?.tone} text={result?.text} />
      <Button label={authCopy.submitForgot} onPress={() => void submit()} loading={busy} />
      <LinkButton label={authCopy.backToLogin} onPress={onBack} />
    </Screen>
  );
}
