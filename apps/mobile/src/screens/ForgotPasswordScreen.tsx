import { APP_NAME, authCopy } from "@meguiars/domain";
import { fieldErrors, forgotPasswordSchema } from "@meguiars/validation";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Message, Screen, text } from "@/ui/kit";
import { Text } from "react-native";

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
      <Text style={text.muted}>{authCopy.forgotHelp}</Text>
      <Field
        label={authCopy.emailLabel}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        error={fields.email}
      />
      <Message tone={result?.tone} text={result?.text} />
      <Button label={authCopy.submitForgot} onPress={() => void submit()} busy={busy} />
      <Button variant="link" label={authCopy.backToLogin} onPress={onBack} />
    </Screen>
  );
}
