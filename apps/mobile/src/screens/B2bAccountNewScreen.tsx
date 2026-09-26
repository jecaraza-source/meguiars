import { activeCenterAccess, b2bCopy, can, type ViewState } from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { AccountEditor } from "@/components/B2bForms";
import { LinkButton } from "@/ui/controls";
import { Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

/** Alta de cuenta B2B (equivale a /comercial/b2b/nueva en web). */
export function B2bAccountNewScreen({
  state,
  header,
  onOpen,
  onCancel,
}: PrivateScreenProps & { onOpen: (id: string) => void; onCancel: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [companies, setCompanies] = useState<ViewState<{ id: string; name: string }[]>>({
    status: "loading",
  });
  const centers = state.access
    .filter((a) => a.center.active && can([...a.roles, ...a.corporateRoles], "b2b.write"))
    .map((a) => ({ id: a.center.id, name: a.center.name }));

  useEffect(() => {
    if (!client) return;
    void createB2bRepository(client)
      .companiesWithoutAccount()
      .then((r) =>
        setCompanies(
          r.ok ? { status: "ready", data: r.data } : { status: "error", message: r.error.message },
        ),
      );
  }, [client]);

  return (
    <Screen title={b2bCopy.newAccount} description={b2bCopy.newAccountDescription} header={header}>
      <LinkButton label={`← ${b2bCopy.title}`} onPress={onCancel} />
      {companies.status === "loading" ? <Skeleton lines={4} label="Cargando empresas" /> : null}
      {companies.status === "error" || companies.status === "permission_denied" ? (
        <EmptyState title={companies.message} />
      ) : null}
      {companies.status === "ready" ? (
        <Card>
          <AccountEditor
            companies={companies.data}
            centers={centers}
            defaultCenterId={center.id}
            onSaved={onOpen}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
