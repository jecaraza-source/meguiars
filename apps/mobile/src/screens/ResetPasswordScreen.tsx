import { APP_NAME, authCopy } from "@meguiars/domain";
import { fieldErrors, resetPasswordSchema } from "@meguiars/validation";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field } from "@/ui/controls";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";

export function ResetPasswordScreen() {
  const { updatePassword, finishRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    setFields({});
    setBusy(true);
    const res = await updatePassword(parsed.data.password);
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error.message);
  };

  return (
    <Screen eyebrow={APP_NAME.toUpperCase()} title={authCopy.resetTitle}>
      <Field
        label={authCopy.newPasswordLabel}
        hint="Al menos 8 caracteres."
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        error={fields.password}
      />
      <Field
        label={authCopy.confirmPasswordLabel}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        textContentType="newPassword"
        error={fields.confirm}
      />
      <Notice tone="danger" text={error} />
      <Notice tone="success" text={done ? authCopy.resetDone : null} />
      {done ? (
        <Button label="Continuar" onPress={finishRecovery} />
      ) : (
        <Button label={authCopy.submitReset} onPress={() => void submit()} loading={busy} />
      )}
    </Screen>
  );
}
