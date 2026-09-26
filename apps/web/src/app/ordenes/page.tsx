import {
  activeCenterAccess,
  canInActiveCenter,
  ORDER_STATUS_LABELS,
  ordersCopy,
  presentOrderListItem,
  SERVICE_ORDER_STATUSES,
} from "@meguiars/domain";
import { createServiceOrderRepository } from "@meguiars/supabase";
import { orderFilterSchema } from "@meguiars/validation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OrdersPage({ searchParams }: PageProps<"/ordenes">) {
  const state = await requireScreen("orders");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const parsed = orderFilterSchema.safeParse({ status: param("estado"), query: param("q") });
  const filter = parsed.success ? parsed.data : {};
  const orders = await createServiceOrderRepository((await createSupabaseServerClient())!).list(
    center.id,
    filter,
  );

  return (
    <AppShell
      state={state}
      screen="orders"
      title={`${ordersCopy.title} · ${center.name}`}
      description={ordersCopy.description}
    >
      <Card
        actions={
          canInActiveCenter(state, "orders.write") ? (
            <ButtonLink href="/ordenes/nueva" label={ordersCopy.newOrder} variant="primary" />
          ) : null
        }
      >
        <form className="grid gap-sm md:grid-cols-3 md:items-end" action="/ordenes">
          <Input name="q" type="search" label={ordersCopy.search} defaultValue={filter.query ?? ""} />
          <Select
            name="estado"
            label={ordersCopy.statusFilter}
            options={[
              { value: "", label: ordersCopy.all },
              ...SERVICE_ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] })),
            ]}
            defaultValue={filter.status ?? ""}
          />
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            {ordersCopy.filter}
          </button>
        </form>
      </Card>
      {!orders.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {orders.error.message}
        </p>
      ) : orders.data.length === 0 ? (
        <EmptyState title={ordersCopy.empty} />
      ) : (
        <Table
          caption={ordersCopy.title}
          rows={orders.data.map((o) => presentOrderListItem(o, center.timezone))}
          rowKey={(o) => o.id}
          rowHref={(o) => `/ordenes/${o.id}`}
          emptyMessage={ordersCopy.empty}
          columns={[
            { key: "folio", header: ordersCopy.folio, value: (o) => o.folio },
            { key: "client", header: ordersCopy.client, value: (o) => `${o.client} · ${o.vehicle}` },
            { key: "status", header: ordersCopy.statusFilter, value: (o) => o.status },
            { key: "total", header: ordersCopy.total, value: (o) => o.total, align: "end" },
            { key: "balance", header: ordersCopy.balance, value: (o) => o.balance, align: "end" },
            { key: "created", header: "Abierta", value: (o) => o.createdAt },
          ]}
        />
      )}
    </AppShell>
  );
}
