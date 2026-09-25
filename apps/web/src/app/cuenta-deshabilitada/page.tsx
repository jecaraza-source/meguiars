import { authCopy } from "@meguiars/domain";
import { logoutAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { getAuthState } from "@/lib/auth/dal";

export default async function DisabledAccountPage() {
  const state = await getAuthState();
  return (
    <AuthCard title={authCopy.disabledTitle}>
      <p role="alert" className="text-mg-danger">
        {authCopy.disabled}
      </p>
      {state.status !== "signed_out" ? (
        <form action={logoutAction}>
          <button type="submit" className="underline">
            {authCopy.logout}
          </button>
        </form>
      ) : null}
    </AuthCard>
  );
}
