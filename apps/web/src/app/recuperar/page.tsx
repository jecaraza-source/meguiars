import { authCopy } from "@meguiars/domain";
import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "@/components/forms";

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/recuperar">) {
  const { error } = await searchParams;
  return (
    <AuthCard title={authCopy.forgotTitle}>
      <ForgotPasswordForm initialError={typeof error === "string" ? error : undefined} />
    </AuthCard>
  );
}
