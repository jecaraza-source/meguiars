import { authCopy } from "@meguiars/domain";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/forms";
import { getAuthState } from "@/lib/auth/dal";
import { safeNext } from "@/lib/auth/redirects";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined);
  if ((await getAuthState()).status === "signed_in") redirect(target);
  return (
    <AuthCard title={authCopy.loginTitle}>
      <LoginForm next={target} />
    </AuthCard>
  );
}
