import { APP_NAME, authCopy } from "@meguiars/domain";
import { fieldErrors, loginSchema } from "@meguiars/validation";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Notice } from "@/ui/notice";
import { Screen } from "@/ui/layout";

export function LoginScreen({ onForgot }: { onForgot: () => void }) {
  const { signIn, linkError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    setFields({});
    setBusy(true);
    setError(await signIn(parsed.data.email, parsed.data.password));
    setBusy(false);
  };

  return (
    <Screen eyebrow={APP_NAME.toUpperCase()} title={authCopy.loginTitle}>
      <Notice tone="danger" text={linkError} />
      <Field
        label={authCopy.emailLabel}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        error={fields.email}
      />
      <Field
        label={authCopy.passwordLabel}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        error={fields.password}
      />
      <Notice tone="danger" text={error} />
      <Button label={authCopy.submitLogin} onPress={() => void submit()} loading={busy} />
      <LinkButton label={authCopy.forgotLink} onPress={onForgot} />
    </Screen>
  );
}
