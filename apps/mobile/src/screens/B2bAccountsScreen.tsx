import {
  activeCenterAccess,
  b2bCopy,
  b2bErrorMessage,
  B2B_ACCOUNT_STATUS_LABELS,
  B2B_ACCOUNT_STATUSES,
  canInActiveCenter,
  presentAccountListItem,
  todayIn,
  type B2bAccountStatus,
  type ViewState,
} from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Select } from "@/ui/controls";
import { Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentAccountListItem>;

/** Cuentas B2B (equivale a /comercial/b2b en web). */
export function B2bAccountsScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
  onProfitability,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: () => void; onProfitability: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [draft, setDraft] = useState({ query: "", status: "" });
  const [filter, setFilter] = useState(draft);
  const [data, setData] = useState<ViewState<Row[]>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createB2bRepository(client)
      .listAccounts(todayIn(center.timezone), {
        query: filter.query || undefined,
        status: (filter.status || undefined) as B2bAccountStatus | undefined,
      })
      .then((r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: b2bErrorMessage(r.error) });
        setData(
          r.data.length === 0
            ? { status: "empty" }
            : { status: "ready", data: r.data.map(presentAccountListItem) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, filter, center.timezone]);

  return (
    <Screen title={b2bCopy.title} description={b2bCopy.description} header={header}>
      {subnav}
      {canInActiveCenter(state, "b2b.write") ? <Button label={b2bCopy.newAccount} onPress={onNew} /> : null}
      <Button label={b2bCopy.profitabilityTitle} variant="secondary" onPress={onProfitability} />
      <Card>
        <Field
          label={b2bCopy.search}
          value={draft.query}
          onChangeText={(x) => setDraft((d) => ({ ...d, query: x }))}
          autoCapitalize="none"
        />
        <Select
          label={b2bCopy.statusFilter}
          options={[
            { value: "", label: b2bCopy.allStatuses },
            ...B2B_ACCOUNT_STATUSES.map((s) => ({ value: s, label: B2B_ACCOUNT_STATUS_LABELS[s] })),
          ]}
          value={draft.status}
          onChange={(x) => setDraft((d) => ({ ...d, status: x }))}
        />
        <Button
          label="Filtrar"
          variant="secondary"
          onPress={() => {
            setData({ status: "loading" });
            setFilter(draft);
          }}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando cuentas" /> : null}
      {data.status === "empty" ? <EmptyState title={b2bCopy.empty} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={b2bCopy.title}
          rows={data.data}
          rowKey={(a) => a.id}
          onRowPress={(a) => onOpen(a.id)}
          emptyMessage={b2bCopy.empty}
          columns={[
            { key: "name", header: "Cuenta", value: (a) => a.name },
            { key: "rfc", header: "RFC", value: (a) => a.rfc },
            { key: "status", header: b2bCopy.status, value: (a) => a.status },
            { key: "home", header: b2bCopy.homeCenter, value: (a) => a.homeCenter },
            { key: "agreement", header: "Convenio", value: (a) => a.agreement },
          ]}
        />
      ) : null}
    </Screen>
  );
}
