import { authCopy } from "@meguiars/domain";
import { logoutAction } from "@/app/actions/auth";
import { PlainShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { getAuthState } from "@/lib/auth/dal";

export default async function DisabledAccountPage() {
  const state = await getAuthState();
  return (
    <PlainShell title={authCopy.disabledTitle}>
      <p role="alert" className="mg-tone rounded-md border p-md" data-tone="danger">
        {authCopy.disabled}
      </p>
      {state.status !== "signed_out" ? (
        <form action={logoutAction}>
          <Button type="submit" label={authCopy.logout} variant="secondary" />
        </form>
      ) : null}
    </PlainShell>
  );
}
