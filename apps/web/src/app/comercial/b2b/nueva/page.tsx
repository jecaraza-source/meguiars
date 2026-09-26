import { activeCenterAccess, b2bCopy, can, newRequestId } from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AccountForm } from "@/components/b2b-forms";
import { Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewB2bAccountPage() {
  const state = await requireScreen("b2bAccountNew");
  const center = activeCenterAccess(state)!.center;
  const companies = await createB2bRepository(
    (await createSupabaseServerClient())!,
  ).companiesWithoutAccount();
  // Centros donde puede administrar cuentas (centro gestor).
  const centers = state.access
    .filter((a) => a.center.active && can([...a.roles, ...a.corporateRoles], "b2b.write"))
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  return (
    <AppShell
      state={state}
      screen="b2bAccountNew"
      title={b2bCopy.newAccount}
      description={b2bCopy.newAccountDescription}
    >
      <Link href="/comercial/b2b" className="text-sm underline">
        ← {b2bCopy.title}
      </Link>
      <Card>
        {companies.ok ? (
          <AccountForm
            requestId={newRequestId()}
            companies={companies.data}
            centers={centers}
            defaultCenterId={center.id}
          />
        ) : (
          <p role="alert" className="text-sm">
            {companies.error.message}
          </p>
        )}
      </Card>
    </AppShell>
  );
}
