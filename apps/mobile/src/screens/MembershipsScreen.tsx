import {
  activeCenterAccess,
  canInActiveCenter,
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUSES,
  membershipErrorMessage,
  membershipsCopy,
  presentMembershipListItem,
  todayIn,
  type MembershipStatus,
  type ViewState,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Select } from "@/ui/controls";
import { Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentMembershipListItem>;

/** Membresías del centro (equivale a /comercial/membresias en web). */
export function MembershipsScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
  onPlans,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: () => void; onPlans: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState({ query: "", status: "" });
  const [data, setData] = useState<ViewState<Row[]>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    const today = todayIn(center.timezone);
    void createMembershipRepository(client)
      .list(center.id, {
        query: filter.query || undefined,
        status: (filter.status || undefined) as MembershipStatus | undefined,
      })
      .then((r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: membershipErrorMessage(r.error) });
        setData(
          r.data.length === 0
            ? { status: "empty" }
            : { status: "ready", data: r.data.map((m) => presentMembershipListItem(m, today)) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, center.id, center.timezone, filter]);

  return (
    <Screen title={membershipsCopy.title} description={membershipsCopy.description} header={header}>
      {subnav}
      {canInActiveCenter(state, "memberships.write") ? (
        <Button label={membershipsCopy.newMembership} onPress={onNew} />
      ) : null}
      <Button label={membershipsCopy.plansOpen} variant="secondary" onPress={onPlans} />
      <Card>
        <Field label={membershipsCopy.search} value={query} onChangeText={setQuery} autoCapitalize="none" />
        <Select
          label={membershipsCopy.statusFilter}
          options={[
            { value: "", label: membershipsCopy.allStatuses },
            ...MEMBERSHIP_STATUSES.map((s) => ({ value: s, label: MEMBERSHIP_STATUS_LABELS[s] })),
          ]}
          value={status}
          onChange={setStatus}
        />
        <Button
          label="Filtrar"
          variant="secondary"
          onPress={() => {
            setData({ status: "loading" });
            setFilter({ query, status });
          }}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando membresías" /> : null}
      {data.status === "empty" ? <EmptyState title={membershipsCopy.empty} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={membershipsCopy.title}
          rows={data.data}
          rowKey={(m) => m.id}
          onRowPress={(m) => onOpen(m.id)}
          emptyMessage={membershipsCopy.empty}
          columns={[
            { key: "number", header: membershipsCopy.number, value: (m) => m.number },
            { key: "client", header: membershipsCopy.client, value: (m) => `${m.client} · ${m.vehicle}` },
            { key: "plan", header: membershipsCopy.plan, value: (m) => m.plan },
            { key: "status", header: membershipsCopy.statusFilter, value: (m) => m.label },
            {
              key: "renewal",
              header: membershipsCopy.nextRenewal,
              value: (m) => `${m.endsOn} · ${m.renewal}`,
            },
            { key: "price", header: membershipsCopy.price, value: (m) => m.price },
          ]}
        />
      ) : null}
    </Screen>
  );
}
