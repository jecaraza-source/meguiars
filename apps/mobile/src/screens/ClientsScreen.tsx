import {
  activeCenterAccess,
  canInActiveCenter,
  clientErrorMessage,
  clientsCopy,
  presentSearchResult,
  type ViewState,
} from "@meguiars/domain";
import { createClientRepository } from "@meguiars/supabase";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field } from "@/ui/controls";
import { Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentSearchResult>;

export function ClientsScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ViewState<Row[]> | null>(null);

  const search = async () => {
    if (!client) return;
    setResults({ status: "loading" });
    // Misma RPC que la web: RLS limita a los clientes visibles desde los centros del usuario.
    const result = await createClientRepository(client).search(center.id, query);
    if (!result.ok) {
      setResults({
        status: "error",
        message:
          result.error.kind === "validation" ? clientsCopy.searchHint : clientErrorMessage(result.error),
      });
      return;
    }
    const rows = result.data.map((r) => presentSearchResult(r, center.timezone));
    setResults(rows.length ? { status: "ready", data: rows } : { status: "empty" });
  };

  return (
    <Screen title={clientsCopy.title} description={clientsCopy.description} header={header}>
      {subnav}
      <Card>
        <Field
          label={clientsCopy.searchLabel}
          hint={clientsCopy.searchHint}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search()}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label={clientsCopy.searchSubmit} variant="secondary" onPress={() => void search()} />
        {canInActiveCenter(state, "clients.write") ? (
          <Button label={clientsCopy.newClient} onPress={onNew} />
        ) : null}
      </Card>
      {results === null ? (
        <EmptyState title={clientsCopy.searchPromptTitle} message={clientsCopy.searchPromptMessage} />
      ) : null}
      {results?.status === "loading" ? <Skeleton lines={3} label="Buscando clientes" /> : null}
      {results?.status === "error" ? <Notice tone="danger" text={results.message} /> : null}
      {results?.status === "empty" ? (
        <EmptyState title={clientsCopy.searchEmptyTitle} message={clientsCopy.searchEmptyMessage} />
      ) : null}
      {results?.status === "ready" ? (
        <List
          caption={`Resultados para ${query}`}
          rows={results.data}
          rowKey={(r) => r.id}
          onRowPress={(r) => onOpen(r.id)}
          emptyMessage={clientsCopy.searchEmptyTitle}
          columns={[
            { key: "name", header: "Cliente", value: (r) => r.name },
            { key: "phone", header: "Teléfono", value: (r) => r.phone },
            { key: "plates", header: "Placas", value: (r) => r.plates },
            { key: "home", header: "Centro habitual", value: (r) => r.home },
            { key: "last", header: clientsCopy.lastVisitLabel, value: (r) => r.lastVisit },
            { key: "match", header: "Coincide por", value: (r) => r.match },
          ]}
        />
      ) : null}
    </Screen>
  );
}
