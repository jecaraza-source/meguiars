import {
  activeCenterAccess,
  b2bCopy,
  canInCenter,
  formatMoney,
  presentAgreement,
  presentPriceRule,
  resolveB2bPrice,
  todayIn,
  type B2bAgreement,
  type B2bPriceRule,
  type CatalogItem,
  type ViewState,
} from "@meguiars/domain";
import { createB2bRepository, createCatalogRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { AgreementEditor, PriceRuleEditor, ReasonAction, toggleRule } from "@/components/B2bForms";
import { LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  agreement: B2bAgreement;
  accountName: string;
  accountHomeCenterId: string | null;
  rules: B2bPriceRule[];
  services: CatalogItem[];
}

/** Convenio y tarifas (equivale a /comercial/b2b/convenios/[id] en web). */
export function B2bAgreementScreen({
  state,
  header,
  agreementId,
  onBack,
}: PrivateScreenProps & { agreementId: string; onBack: (accountId: string | null) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void Promise.all([
      createB2bRepository(client).getAgreement(agreementId),
      createCatalogRepository(client).listForCenter(center.id),
    ]).then(([g, c]) => {
      if (!active) return;
      if (!g.ok) return setData({ status: "permission_denied", message: g.error.message });
      setData({ status: "ready", data: { ...g.data, services: c.ok ? c.data : [] } });
    });
    return () => {
      active = false;
    };
  }, [client, agreementId, center.id, version]);

  if (data.status !== "ready") {
    return (
      <Screen title={b2bCopy.agreementsTitle} header={header}>
        <LinkButton label={`← ${b2bCopy.title}`} onPress={() => onBack(null)} />
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando convenio" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }
  const { agreement: g, accountName, accountHomeCenterId, rules, services } = data.data;
  const centerNames = new Map(state.access.map((a) => [a.center.id, a.center.name]));
  const view = presentAgreement(g, today, (id) => centerNames.get(id) ?? "Otro centro");
  const canWrite = accountHomeCenterId ? canInCenter(state, accountHomeCenterId, "b2b.write") : false;
  const orgCenters = state.access
    .filter((a) => a.center.active)
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  const preview = services.map((s) => {
    const p = resolveB2bPrice(rules, {
      serviceId: s.id,
      listPrice: s.price,
      quantity: 1,
      monthlyVolume: 1,
      usedUnits: 0,
      includedUnits: g.includedUnits,
    });
    return {
      id: s.id,
      name: s.name,
      list: formatMoney(s.price),
      agreed: p.ruleId ? formatMoney(p.price) : "Lista",
    };
  });

  return (
    <Screen title={`${view.name} · ${accountName}`} description={view.model} header={header}>
      <LinkButton label={`← ${accountName}`} onPress={() => onBack(g.accountId)} />
      <Badge label={view.state} tone={view.stateTone} />
      {!view.applies ? <Notice tone="warning" text={b2bCopy.agreementExpiredHint} /> : null}
      <Card title={b2bCopy.rulesTitle} subtitle={b2bCopy.rulesHint}>
        {rules.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.rulesEmpty}</Text>
        ) : null}
        {rules.map((r) => {
          const v = presentPriceRule(r);
          return (
            <View key={r.id} style={styles.row}>
              <Text style={textStyle("body")}>
                {v.service} · {v.kind} · {v.value} · {v.volume} · {v.status}
              </Text>
              {canWrite ? (
                <ReasonAction
                  label={r.active ? b2bCopy.deactivate : b2bCopy.activate}
                  run={toggleRule(r)}
                  onDone={reload}
                />
              ) : null}
            </View>
          );
        })}
        {canWrite ? (
          <PriceRuleEditor agreementId={g.id} services={services} model={g.billingModel} onDone={reload} />
        ) : null}
      </Card>
      <Card title={b2bCopy.pricePreview} subtitle="Primera OS del mes, sin unidades consumidas">
        <List
          caption={b2bCopy.pricePreview}
          rows={preview}
          rowKey={(p) => p.id}
          emptyMessage="Sin servicios en el catálogo del centro."
          columns={[
            { key: "name", header: "Servicio", value: (p) => p.name },
            { key: "list", header: b2bCopy.listPrice, value: (p) => p.list },
            { key: "agreed", header: b2bCopy.convenio, value: (p) => p.agreed },
          ]}
        />
      </Card>
      <Card title="Condiciones">
        {canWrite ? (
          <AgreementEditor
            key={`g-${version}`}
            accountId={g.accountId}
            agreement={g}
            centers={orgCenters}
            today={today}
            onSaved={reload}
          />
        ) : (
          <Text style={textStyle("body")}>
            {view.validity} · {view.vehicles} · {view.terms} · {view.fee} · {view.centers}
          </Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { gap: space.xs, paddingVertical: space.xs } });
