import { authCopy } from "@meguiars/domain";
import { logoutAction } from "@/app/actions/auth";
import { PlainShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

export default async function NoCentersPage() {
  await requireScreen("account");
  return (
    <PlainShell title={authCopy.noCentersTitle}>
      <EmptyState title={authCopy.noCentersTitle} message={authCopy.noCenters} />
      <form action={logoutAction}>
        <Button type="submit" label={authCopy.logout} variant="secondary" />
      </form>
    </PlainShell>
  );
}
