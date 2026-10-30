import {
  activeCenterAccess,
  canInActiveCenter,
  CLIENT_PAGE_SIZE,
  clientErrorMessage,
  clientPageInfo,
  clientsCopy,
  presentClientListItem,
  presentSearchResult,
  type ViewState,
} from "@meguiars/domain";
import { createClientRepository } from "@meguiars/supabase";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field } from "@/ui/controls";
import { Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentSearchResult>;
type CatalogRow = ReturnType<typeof presentClientListItem>;
type CatalogData = { rows: CatalogRow[]; page: number; total: number };

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
  // Sin búsqueda: catálogo completo, 50 por página con «Cargar más» (misma RPC que la web).
  const [catalog, setCatalog] = useState<ViewState<CatalogData>>({
    status: "loading",
  });
  const fetchPage = useCallback(
    async (page: number, previous: CatalogRow[]): Promise<ViewState<CatalogData>> => {
      if (!client) return { status: "loading" };
      const r = await createClientRepository(client).list(center.id, page);
      if (!r.ok) return { status: "error", message: clientErrorMessage(r.error) };
      const rows = [...previous, ...r.data.rows.map((x) => presentClientListItem(x, center.timezone))];
      return rows.length
        ? { status: "ready", data: { rows, page, total: r.data.total } }
        : { status: "empty" };
    },
    [client, center.id, center.timezone],
  );
  useEffect(() => {
    let active = true;
    void fetchPage(1, []).then((next) => {
      if (active) setCatalog(next);
    });
    return () => {
      active = false;
    };
  }, [fetchPage]);
  const loadMore = (page: number, previous: CatalogRow[]) => void fetchPage(page, previous).then(setCatalog);

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
        <>
          {catalog.status === "loading" ? <Skeleton lines={4} label="Cargando clientes" /> : null}
          {catalog.status === "error" || catalog.status === "permission_denied" ? (
            <Notice tone="danger" text={catalog.message} />
          ) : null}
          {catalog.status === "empty" ? <EmptyState title={clientsCopy.catalogEmpty} /> : null}
          {catalog.status === "ready" ? (
            <>
              <List
                caption={`${clientsCopy.catalogTitle} · ${clientPageInfo(1, catalog.data.total, catalog.data.rows.length || 1).label}`}
                rows={catalog.data.rows}
                rowKey={(r) => r.id}
                onRowPress={(r) => onOpen(r.id)}
                emptyMessage={clientsCopy.catalogEmpty}
                columns={[
                  { key: "name", header: "Cliente", value: (r) => r.name },
                  { key: "phone", header: "Teléfono", value: (r) => r.phone },
                  { key: "plates", header: "Placas", value: (r) => r.plates },
                  { key: "last", header: clientsCopy.lastVisitLabel, value: (r) => r.lastVisit },
                ]}
              />
              {clientPageInfo(catalog.data.page, catalog.data.total, CLIENT_PAGE_SIZE).hasNext ? (
                <Button
                  label={clientsCopy.loadMore}
                  variant="secondary"
                  onPress={() => loadMore(catalog.data.page + 1, catalog.data.rows)}
                />
              ) : null}
            </>
          ) : null}
        </>
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
