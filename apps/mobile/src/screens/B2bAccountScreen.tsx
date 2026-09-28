import {
  activeCenterAccess,
  addDays,
  b2bCopy,
  b2bErrorMessage,
  B2B_ACCOUNT_STATUS_LABELS,
  B2B_ACCOUNT_STATUS_TONES,
  can,
  canInActiveCenter,
  canInCenter,
  pipelineCopy,
  formatDateInCenterTimeZone,
  guardScreen,
  presentDocumentRow,
  receivablesCopy,
  receivablesErrorMessage,
  presentAccountOrder,
  presentAgreement,
  statementCards,
  todayIn,
  type B2bAccountDetail,
  type B2bAccountOrder,
  type B2bBillingDocument,
  type B2bStatement,
  type ViewState,
} from "@meguiars/domain";
import { createB2bRepository, createReceivablesRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { AccountEditor, AgreementEditor, ContactEditor, VehicleToggle } from "@/components/B2bForms";
import { LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  detail: B2bAccountDetail;
  statement: B2bStatement | null;
  orders: B2bAccountOrder[];
  /** Documentos de cobro abiertos (CxC B2B, centro gestor). */
  documents: B2bBillingDocument[] | null;
  /** Errores de secciones que no impiden mostrar la ficha. */
  errors: string[];
}

/** Ficha de la cuenta B2B (equivale a /comercial/b2b/[id] en web). */
export function B2bAccountScreen({
  state,
  header,
  accountId,
  onBack,
  onOpenAgreement,
  onNewOpportunity,
  onOpenReceivables,
}: PrivateScreenProps & {
  accountId: string;
  onBack: () => void;
  onOpenAgreement: (id: string) => void;
  onNewOpportunity?: (accountId: string) => void;
  onOpenReceivables?: (accountId: string) => void;
}) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createB2bRepository(client);
    void Promise.all([
      repo.getAccount(accountId),
      repo.statement(accountId),
      repo.accountOrders(accountId, addDays(today, -89), today),
    ]).then(async ([d, s, o]) => {
      if (!active) return;
      if (!d.ok) return setData({ status: "permission_denied", message: b2bCopy.notFound });
      // La cartera es del centro gestor de la cuenta.
      const docs = await createReceivablesRepository(client).documents([d.data.account.homeDetailCenterId], {
        accountId,
      });
      if (!active) return;
      setData({
        status: "ready",
        data: {
          detail: d.data,
          statement: s.ok ? s.data : null,
          orders: o.ok ? o.data : [],
          documents: docs.ok ? docs.data : null,
          errors: [
            ...[s, o].flatMap((r) => (r.ok ? [] : [b2bErrorMessage(r.error)])),
            ...(docs.ok ? [] : [receivablesErrorMessage(docs.error)]),
          ],
        },
      });
    });
    return () => {
      active = false;
    };
  }, [client, accountId, today, version]);

  if (data.status !== "ready") {
    return (
      <Screen title={b2bCopy.title} header={header}>
        <LinkButton label={`← ${b2bCopy.title}`} onPress={onBack} />
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando cuenta" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }
  const { detail, statement, orders, documents, errors } = data.data;
  const { account, agreements, vehicles, contacts } = detail;
  // Administrar y facturar se deciden en el centro gestor de la cuenta (la base lo vuelve a validar).
  const canWrite = canInCenter(state, account.homeDetailCenterId, "b2b.write");
  const centerNames = new Map(state.access.map((a) => [a.center.id, a.center.name]));
  const centerName = (id: string) => centerNames.get(id) ?? "Otro centro";
  const writableCenters = state.access
    .filter((a) => a.center.active && can([...a.roles, ...a.corporateRoles], "b2b.write"))
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  if (!writableCenters.some((c) => c.id === account.homeDetailCenterId))
    writableCenters.unshift({ id: account.homeDetailCenterId, name: centerName(account.homeDetailCenterId) });
  const orgCenters = state.access
    .filter((a) => a.center.active && a.center.organizationId === account.organizationId)
    .map((a) => ({ id: a.center.id, name: a.center.name }));

  return (
    <Screen
      title={account.name}
      description={[account.legalName, account.rfc].filter(Boolean).join(" · ")}
      header={header}
    >
      <LinkButton label={`← ${b2bCopy.title}`} onPress={onBack} />
      {onNewOpportunity &&
      canInCenter(state, account.homeDetailCenterId, "b2b.write") &&
      canInActiveCenter(state, "pipeline.write") ? (
        <LinkButton label={pipelineCopy.newOpportunity} onPress={() => onNewOpportunity(account.id)} />
      ) : null}
      <Badge
        label={B2B_ACCOUNT_STATUS_LABELS[account.status]}
        tone={B2B_ACCOUNT_STATUS_TONES[account.status]}
      />
      {errors.map((e) => (
        <Notice key={e} tone="danger" text={e} />
      ))}
      {statement ? (
        <View style={styles.stack}>
          {statementCards(statement).map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} caption={k.caption} />
          ))}
        </View>
      ) : null}

      <Card title={b2bCopy.agreementsTitle}>
        {agreements.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.agreementsEmpty}</Text>
        ) : null}
        {agreements.map((g) => {
          const v = presentAgreement(g, today, centerName);
          return (
            <View key={g.id} style={styles.row}>
              <LinkButton label={`${v.name} · ${v.state}`} onPress={() => onOpenAgreement(g.id)} />
              <Text style={textStyle("bodySmall", "muted")}>
                {v.model} · {v.validity} · {v.centers}
              </Text>
            </View>
          );
        })}
      </Card>
      {canWrite ? (
        <Card title={b2bCopy.newAgreement}>
          <AgreementEditor
            accountId={account.id}
            centers={orgCenters}
            today={today}
            onSaved={onOpenAgreement}
          />
        </Card>
      ) : null}

      <Card title={b2bCopy.vehiclesTitle}>
        {vehicles.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.vehiclesEmpty}</Text>
        ) : null}
        {vehicles.map((v) => (
          <View key={v.vehicleId} style={styles.row}>
            <Text style={textStyle("body")}>{v.label}</Text>
            <Badge
              label={v.authorized ? b2bCopy.authorized : b2bCopy.notAuthorized}
              tone={v.authorized ? "success" : "neutral"}
            />
            {canWrite ? <VehicleToggle accountId={account.id} vehicle={v} onDone={reload} /> : null}
          </View>
        ))}
      </Card>

      <Card title={b2bCopy.ordersTitle} subtitle="Últimos 90 días">
        <List
          caption={b2bCopy.ordersTitle}
          rows={orders.map((o) =>
            presentAccountOrder(o, (iso) => formatDateInCenterTimeZone(iso, center.timezone)),
          )}
          rowKey={(o) => o.id}
          emptyMessage={b2bCopy.ordersEmpty}
          columns={[
            { key: "folio", header: "Folio", value: (o) => o.folio },
            { key: "date", header: "Fecha", value: (o) => `${o.date} · ${o.center}` },
            { key: "vehicle", header: "Vehículo", value: (o) => o.vehicle },
            { key: "po", header: b2bCopy.purchaseOrder, value: (o) => o.purchaseOrder },
            { key: "evidences", header: b2bCopy.evidences, value: (o) => o.evidences },
            { key: "invoice", header: "Factura", value: (o) => o.invoice },
            { key: "total", header: "Total", value: (o) => o.total },
          ]}
        />
      </Card>

      <Card title={receivablesCopy.title} subtitle={receivablesCopy.notCfdi}>
        {documents && documents.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{receivablesCopy.empty}</Text>
        ) : null}
        {(documents ?? []).map(presentDocumentRow).map((d) => (
          <View key={d.id} style={styles.row}>
            <Text style={textStyle("body")}>
              {d.folio} · {d.period} · {receivablesCopy.dueOn.toLowerCase()} {d.dueOn}
            </Text>
            <Badge label={`${d.status} · ${d.balance}`} tone={d.statusTone} />
          </View>
        ))}
        {onOpenReceivables && guardScreen(state, "receivableAccount").allow ? (
          <LinkButton
            label={`${receivablesCopy.openReceivables} →`}
            onPress={() => onOpenReceivables(account.id)}
          />
        ) : null}
      </Card>

      <Card title={b2bCopy.contactsTitle}>
        {contacts.filter((c) => c.active).length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{b2bCopy.contactsEmpty}</Text>
        ) : null}
        {contacts
          .filter((c) => c.active)
          .map((c) => (
            <Text key={c.id} style={textStyle("body")}>
              {c.fullName}
              {c.title ? ` · ${c.title}` : ""}
              {c.phone ? ` · ${c.phone}` : ""}
              {c.email ? ` · ${c.email}` : ""}
              {c.isPrimary ? " · Principal" : ""}
            </Text>
          ))}
        {canWrite ? <ContactEditor accountId={account.id} onDone={reload} /> : null}
      </Card>

      {canWrite ? (
        <Card title={b2bCopy.accountData}>
          <AccountEditor
            account={account}
            centers={writableCenters}
            defaultCenterId={center.id}
            onSaved={reload}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  row: { gap: space.xs, paddingVertical: space.xs },
});
