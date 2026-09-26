import {
  activeCenterAccess,
  canManageServices,
  formatDateOnly,
  membershipsCopy,
  presentPlan,
  todayIn,
  type CatalogItem,
  type MembershipPlan,
  type ViewState,
} from "@meguiars/domain";
import { createCatalogRepository, createMembershipRepository } from "@meguiars/supabase";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { BenefitsCard, PlanFormCard } from "@/components/MembershipPlanForms";
import { LinkButton } from "@/ui/controls";
import { Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Planes de membresía (equivale a /comercial/planes en web). */
export function MembershipPlansScreen({
  state,
  header,
  onOpen,
  onBack,
}: PrivateScreenProps & { onOpen: (id: string) => void; onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const manage = canManageServices(state);
  const [data, setData] = useState<ViewState<MembershipPlan[]>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createMembershipRepository(client)
      .listPlans(center.organizationId, { includeInactive: manage })
      .then((r) => {
        if (!active) return;
        setData(
          !r.ok
            ? { status: "error", message: r.error.message }
            : r.data.length === 0
              ? { status: "empty" }
              : { status: "ready", data: r.data },
        );
      });
    return () => {
      active = false;
    };
  }, [client, center.organizationId, manage]);

  return (
    <Screen title={membershipsCopy.plansTitle} description={membershipsCopy.plansDescription} header={header}>
      <LinkButton label={`← ${membershipsCopy.title}`} onPress={onBack} />
      {data.status === "loading" ? <Skeleton lines={3} label="Cargando planes" /> : null}
      {data.status === "empty" ? <EmptyState title="Aún no hay planes." /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={membershipsCopy.plansTitle}
          rows={data.data.map(presentPlan)}
          rowKey={(p) => p.id}
          onRowPress={(p) => onOpen(p.id)}
          emptyMessage="Aún no hay planes."
          columns={[
            { key: "name", header: membershipsCopy.planName, value: (p) => p.name },
            { key: "price", header: membershipsCopy.planPrice, value: (p) => p.price },
            { key: "benefits", header: membershipsCopy.benefitsTitle, value: (p) => p.benefits },
            { key: "scope", header: membershipsCopy.planScope, value: (p) => p.scope },
            { key: "status", header: "Estatus", value: (p) => p.status },
          ]}
        />
      ) : null}
      {manage ? (
        <PlanFormCard
          organizationId={center.organizationId}
          today={todayIn(center.timezone)}
          onSaved={onOpen}
        />
      ) : null}
    </Screen>
  );
}

/** Detalle y edición de un plan (equivale a /comercial/planes/[id] en web). */
export function MembershipPlanScreen({
  state,
  header,
  planId,
  onBack,
}: PrivateScreenProps & { planId: string; onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const manage = canManageServices(state);
  const [data, setData] = useState<ViewState<{ plan: MembershipPlan; services: CatalogItem[] }>>({
    status: "loading",
  });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void Promise.all([
      createMembershipRepository(client).getPlan(planId),
      manage ? createCatalogRepository(client).listForCenter(center.id) : null,
    ]).then(([plan, catalog]) => {
      if (!active) return;
      setData(
        plan.ok
          ? { status: "ready", data: { plan: plan.data, services: catalog?.ok ? catalog.data : [] } }
          : { status: "permission_denied", message: "El plan no existe." },
      );
    });
    return () => {
      active = false;
    };
  }, [client, planId, manage, center.id, version]);

  const back = <LinkButton label={`← ${membershipsCopy.plansTitle}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={membershipsCopy.plansTitle} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={4} label="Cargando plan" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }
  const { plan, services } = data.data;
  const view = presentPlan(plan);
  return (
    <Screen title={view.name} description={plan.description ?? view.period} header={header}>
      {back}
      <Card title={view.price} subtitle={`${view.period} · ${view.scope}`}>
        <Text style={textStyle("bodySmall")}>
          {membershipsCopy.planNotice}: {plan.renewalNoticeDays} · Venta desde{" "}
          {formatDateOnly(plan.availableFrom)}
          {plan.availableUntil ? ` hasta ${formatDateOnly(plan.availableUntil)}` : ""} · {view.status}
        </Text>
        {plan.restrictions ? <Text style={textStyle("bodySmall", "muted")}>{plan.restrictions}</Text> : null}
      </Card>
      <BenefitsCard key={`b-${version}`} plan={plan} services={services} editable={manage} onSaved={reload} />
      {manage ? (
        <PlanFormCard
          key={`f-${version}`}
          organizationId={plan.organizationId}
          plan={plan}
          today={todayIn(center.timezone)}
          onSaved={reload}
        />
      ) : null}
    </Screen>
  );
}
