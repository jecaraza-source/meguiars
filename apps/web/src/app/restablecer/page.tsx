import { authCopy } from "@meguiars/domain";
import { PlainShell } from "@/components/app-shell";
import { ResetPasswordForm } from "@/components/forms";
import { requireScreen } from "@/lib/auth/dal";

// Se llega aquí con la sesión de recuperación que abre /auth/confirm.
export default async function ResetPasswordPage() {
  await requireScreen("account");
  return (
    <PlainShell title={authCopy.resetTitle}>
      <ResetPasswordForm />
    </PlainShell>
  );
}
