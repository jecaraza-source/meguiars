import { authCopy } from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

export default async function ForbiddenPage() {
  const state = await requireScreen("account");
  return (
    <AppShell state={state} screen="account" title={authCopy.forbiddenTitle}>
      <EmptyState
        title={authCopy.forbiddenTitle}
        message={authCopy.forbidden}
        action={<ButtonLink href="/" label="Ir al inicio" />}
      />
    </AppShell>
  );
}
