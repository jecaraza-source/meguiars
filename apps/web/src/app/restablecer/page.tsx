import { authCopy } from "@meguiars/domain";
import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "@/components/forms";
import { requireScreen } from "@/lib/auth/dal";

// Se llega aquí con la sesión de recuperación que abre /auth/confirm.
export default async function ResetPasswordPage() {
  await requireScreen("account");
  return (
    <AuthCard title={authCopy.resetTitle}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
