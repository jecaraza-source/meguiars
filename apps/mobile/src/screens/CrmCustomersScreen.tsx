import {
  activeCenterAccess,
  crmCopy,
  CUSTOMER_SEGMENTS,
  NEXT_VISIT_LABELS,
  NEXT_VISIT_STATES,
  presentCrmCustomer,
  SEGMENT_LABELS,
  usableCenters,
  type CustomerSegment,
  type NextVisitState,
  type ViewState,
} from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Select } from "@/ui/controls";
import { Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentCrmCustomer>;

/** Clientes del CRM (equivale a /comercial/clientes en web). */
export function CrmCustomersScreen({
  state,
  header,
  subnav,
  onOpen,
  onTasks,
}: PrivateScreenProps & { onOpen: (id: string) => void; onTasks: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [draft, setDraft] = useState({ scope: "", segment: "", due: "", query: "" });
  const [filter, setFilter] = useState(draft);
  const [data, setData] = useState<ViewState<Row[]>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers =
      filter.scope === "todos" ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
    void createCrmRepository(client)
      .listCustomers(centers, {
        segment: (filter.segment || undefined) as CustomerSegment | undefined,
        due: (filter.due || undefined) as NextVisitState | undefined,
        query: filter.query.trim() || undefined,
      })
      .then((r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: r.error.message });
        setData(
          r.data.length === 0
            ? { status: "empty" }
            : { status: "ready", data: r.data.map((c) => presentCrmCustomer(c, center.timezone)) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, filter, center.id, center.timezone, state.access]);

  const set = (k: keyof typeof draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Screen title={crmCopy.customersTitle} description={crmCopy.customersDescription} header={header}>
      {subnav}
      <Button label={crmCopy.tasksTitle} variant="secondary" onPress={onTasks} />
      <Card>
        <Select
          label={crmCopy.scope}
          options={[
            { value: "", label: center.name },
            { value: "todos", label: crmCopy.allCenters },
          ]}
          value={draft.scope}
          onChange={set("scope")}
        />
        <Select
          label={crmCopy.segment}
          options={[
            { value: "", label: crmCopy.allSegments },
            ...CUSTOMER_SEGMENTS.map((s) => ({ value: s, label: SEGMENT_LABELS[s] })),
          ]}
          value={draft.segment}
          onChange={set("segment")}
        />
        <Select
          label={crmCopy.nextVisit}
          options={[
            { value: "", label: crmCopy.anyNextVisit },
            ...NEXT_VISIT_STATES.map((s) => ({ value: s, label: NEXT_VISIT_LABELS[s] })),
          ]}
          value={draft.due}
          onChange={set("due")}
        />
        <Field label={crmCopy.search} value={draft.query} onChangeText={set("query")} autoCapitalize="none" />
        <Button
          label={crmCopy.filter}
          variant="secondary"
          onPress={() => {
            setData({ status: "loading" });
            setFilter(draft);
          }}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando clientes" /> : null}
      {data.status === "empty" ? <EmptyState title={crmCopy.empty} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={crmCopy.customersTitle}
          rows={data.data}
          rowKey={(c) => c.id}
          onRowPress={(c) => onOpen(c.id)}
          emptyMessage={crmCopy.empty}
          columns={[
            { key: "name", header: "Cliente", value: (c) => c.name },
            { key: "segment", header: crmCopy.segment, value: (c) => c.segment },
            {
              key: "last",
              header: crmCopy.lastVisit,
              value: (c) => `${c.lastVisit} · ${c.visits} ${crmCopy.visits.toLowerCase()}`,
            },
            {
              key: "next",
              header: crmCopy.nextVisit,
              value: (c) => (c.nextVisitLabel === "—" ? c.nextVisit : `${c.nextVisit} · ${c.nextVisitLabel}`),
            },
            { key: "membership", header: crmCopy.membership, value: (c) => c.membership },
            { key: "value", header: crmCopy.lifetimeValue, value: (c) => c.lifetimeValue },
          ]}
        />
      ) : null}
    </Screen>
  );
}
