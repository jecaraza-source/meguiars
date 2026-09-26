import {
  activeCenterAccess,
  canInActiveCenter,
  ORDER_STATUS_LABELS,
  ordersCopy,
  presentOrderListItem,
  SERVICE_ORDER_STATUSES,
  type ServiceOrderStatus,
  type ViewState,
} from "@meguiars/domain";
import { createServiceOrderRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Select } from "@/ui/controls";
import { Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentOrderListItem>;

/** Órdenes de servicio del centro (equivale a /ordenes en web). */
export function OrdersScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState({ query: "", status: "" });
  const [data, setData] = useState<ViewState<Row[]>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createServiceOrderRepository(client)
      .list(center.id, {
        query: filter.query || undefined,
        status: (filter.status || undefined) as ServiceOrderStatus | undefined,
      })
      .then((result) => {
        if (!active) return;
        if (!result.ok) return setData({ status: "error", message: result.error.message });
        setData(
          result.data.length === 0
            ? { status: "empty" }
            : { status: "ready", data: result.data.map((o) => presentOrderListItem(o, center.timezone)) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, center.id, center.timezone, filter]);

  return (
    <Screen title={ordersCopy.title} description={ordersCopy.description} header={header}>
      {subnav}
      {canInActiveCenter(state, "orders.write") ? (
        <Button label={ordersCopy.newOrder} onPress={onNew} />
      ) : null}
      <Card>
        <Field label={ordersCopy.search} value={query} onChangeText={setQuery} autoCapitalize="none" />
        <Select
          label={ordersCopy.statusFilter}
          options={[
            { value: "", label: ordersCopy.all },
            ...SERVICE_ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] })),
          ]}
          value={status}
          onChange={setStatus}
        />
        <Button
          label={ordersCopy.filter}
          variant="secondary"
          onPress={() => {
            setData({ status: "loading" });
            setFilter({ query, status });
          }}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando órdenes" /> : null}
      {data.status === "empty" ? <EmptyState title={ordersCopy.empty} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={ordersCopy.title}
          rows={data.data}
          rowKey={(o) => o.id}
          onRowPress={(o) => onOpen(o.id)}
          emptyMessage={ordersCopy.empty}
          columns={[
            { key: "folio", header: ordersCopy.folio, value: (o) => o.folio },
            { key: "client", header: ordersCopy.client, value: (o) => `${o.client} · ${o.vehicle}` },
            { key: "status", header: ordersCopy.statusFilter, value: (o) => o.status },
            { key: "total", header: ordersCopy.total, value: (o) => o.total },
            { key: "balance", header: ordersCopy.balance, value: (o) => o.balance },
          ]}
        />
      ) : null}
    </Screen>
  );
}
