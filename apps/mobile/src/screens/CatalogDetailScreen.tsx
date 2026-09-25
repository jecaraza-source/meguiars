import {
  activeCenterAccess,
  canConfigureCenterCatalog,
  canManageServices,
  catalogCopy,
  centerName,
  presentCatalogItem,
  presentPriceHistory,
  type CatalogItem,
  type PriceHistoryEntry,
  type Service,
  type ViewState,
} from "@meguiars/domain";
import { createCatalogRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { centerConfigSchema, fieldErrors, updateServiceSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import type { FieldErrors, FormValues } from "@/components/ClientFields";
import { ServiceFields } from "@/components/ServiceFields";
import { Button, Checkbox, Field, LinkButton } from "@/ui/controls";
import { Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  service: Service;
  item: CatalogItem;
  history: PriceHistoryEntry[] | string;
}

async function fetchService(
  client: MeguiarsSupabaseClient,
  serviceId: string,
  centerId: string,
): Promise<ViewState<Loaded>> {
  const repo = createCatalogRepository(client);
  const [service, catalog, history] = await Promise.all([
    repo.get(serviceId),
    repo.listForCenter(centerId, { includeInactive: true }),
    repo.priceHistory(serviceId),
  ]);
  const item = catalog.ok ? catalog.data.find((c) => c.id === serviceId) : undefined;
  if (!service.ok || !item) return { status: "permission_denied", message: catalogCopy.notFound };
  return {
    status: "ready",
    data: { service: service.data, item, history: history.ok ? history.data : history.error.message },
  };
}

const errorText = (error: { code?: string; kind: string; message: string }) =>
  error.kind === "permission_denied" ? catalogCopy.forbidden : error.message;

export function CatalogDetailScreen({
  state,
  header,
  serviceId,
  onBack,
}: PrivateScreenProps & { serviceId: string; onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(async () => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchService(client, serviceId, center.id).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [client, serviceId, center.id, version]);

  const back = <LinkButton label={`← ${catalogCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={catalogCopy.title} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={4} label="Cargando servicio" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }

  const { service, item, history } = data.data;
  const view = presentCatalogItem(item);
  return (
    <Screen title={view.name} description={service.description ?? view.engine} header={header}>
      {back}
      <View style={styles.kpis}>
        <KpiCard label={catalogCopy.engineLabel} value={view.engine} caption={view.status} />
        <KpiCard label={catalogCopy.durationLabel} value={view.duration} />
        <KpiCard
          label={item.priceSource === "center" ? catalogCopy.centerPrice : catalogCopy.basePrice}
          value={view.price}
          caption={`Costo ${view.cost}`}
        />
        <KpiCard label="Margen estándar" value={view.margin} caption={center.name} />
      </View>
      <Card title={catalogCopy.historyTitle}>
        {typeof history === "string" ? (
          <Notice tone="danger" text={history} />
        ) : (
          <List
            caption={catalogCopy.historyTitle}
            rows={history.map((h) =>
              presentPriceHistory(h, (cid) => centerName(state.access, cid), center.timezone),
            )}
            rowKey={(r) => r.key}
            emptyMessage={catalogCopy.historyEmpty}
            columns={[
              { key: "date", header: "Fecha", value: (r) => r.date },
              { key: "scope", header: "Aplica a", value: (r) => r.scope },
              { key: "price", header: "Precio", value: (r) => r.price },
              { key: "cost", header: "Costo", value: (r) => r.cost },
              { key: "reason", header: "Motivo", value: (r) => r.reason },
            ]}
          />
        )}
      </Card>
      {canConfigureCenterCatalog(state) ? (
        <CenterConfig key={`${item.id}-${version}`} item={item} centerId={center.id} onDone={reload} />
      ) : null}
      {canManageServices(state) ? <EditService key={version} service={service} onDone={reload} /> : null}
    </Screen>
  );
}

function CenterConfig({
  item,
  centerId,
  onDone,
}: {
  item: CatalogItem;
  centerId: string;
  onDone: () => Promise<void>;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [available, setAvailable] = useState(item.available);
  const [values, setValues] = useState<FormValues>({
    priceOverride: item.price !== item.basePrice ? String(item.price) : "",
    directCostOverride: item.directCost !== item.standardDirectCost ? String(item.directCost) : "",
    reason: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!client) return;
    const parsed = centerConfigSchema.safeParse({
      ...values,
      detailCenterId: centerId,
      serviceId: item.id,
      available,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createCatalogRepository(client).configureCenter(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    toast({ message: catalogCopy.saved, tone: "success" });
    await onDone();
  };

  return (
    <Card title={catalogCopy.centerTitle} subtitle={catalogCopy.centerSubtitle}>
      <Checkbox label={catalogCopy.availableLabel} checked={available} onChange={setAvailable} />
      <Field
        label={catalogCopy.priceOverrideLabel}
        keyboardType="decimal-pad"
        value={values.priceOverride ?? ""}
        onChangeText={(v) => set("priceOverride", v)}
        error={errors.priceOverride}
      />
      <Field
        label={catalogCopy.costOverrideLabel}
        keyboardType="decimal-pad"
        value={values.directCostOverride ?? ""}
        onChangeText={(v) => set("directCostOverride", v)}
        error={errors.directCostOverride}
      />
      <Field
        label={catalogCopy.reasonLabel}
        required
        value={values.reason ?? ""}
        onChangeText={(v) => set("reason", v)}
        error={errors.reason}
      />
      <Notice tone="danger" text={error} />
      <Button
        label={catalogCopy.submitCenter}
        variant="secondary"
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

function EditService({ service, onDone }: { service: Service; onDone: () => Promise<void> }) {
  const { client } = useAuth();
  const toast = useToast();
  const [active, setActive] = useState(service.active);
  const [values, setValues] = useState<FormValues>({
    name: service.name,
    description: service.description ?? "",
    revenueEngine: service.revenueEngine,
    standardDurationMinutes: String(service.standardDurationMinutes),
    basePrice: String(service.basePrice),
    standardDirectCost: String(service.standardDirectCost),
    reason: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!client) return;
    const parsed = updateServiceSchema.safeParse({ ...values, id: service.id, active });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createCatalogRepository(client).update(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    toast({ message: catalogCopy.saved, tone: "success" });
    await onDone();
  };

  return (
    <Card title={catalogCopy.editTitle} subtitle={catalogCopy.editSubtitle}>
      <ServiceFields values={values} errors={errors} set={set} />
      <Checkbox label={catalogCopy.activeLabel} checked={active} onChange={setActive} />
      <Notice tone="neutral" text={catalogCopy.deactivateHint} />
      <Field
        label={catalogCopy.reasonLabel}
        required
        value={values.reason ?? ""}
        onChangeText={(v) => set("reason", v)}
        error={errors.reason}
      />
      <Notice tone="danger" text={error} />
      <Button label={catalogCopy.submitUpdate} loading={busy} onPress={() => void submit()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
