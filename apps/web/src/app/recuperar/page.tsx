import { authCopy } from "@meguiars/domain";
import { PlainShell } from "@/components/app-shell";
import { ForgotPasswordForm } from "@/components/forms";

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/recuperar">) {
  const { error } = await searchParams;
  return (
    <PlainShell title={authCopy.forgotTitle}>
      <ForgotPasswordForm initialError={typeof error === "string" ? error : undefined} />
    </PlainShell>
  );
}
