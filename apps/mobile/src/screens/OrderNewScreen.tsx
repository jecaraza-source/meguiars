import {
  activeCenterAccess,
  agendaCopy,
  clientErrorMessage,
  newRequestId,
  orderErrorMessage,
  ordersCopy,
  presentSearchResult,
  type Bay,
  type CatalogItem,
  type ClientDetail,
  type Technician,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createCatalogRepository,
  createClientRepository,
  createServiceOrderRepository,
} from "@meguiars/supabase";
import {
  fieldErrors,
  linesFromQuantities,
  newOrderFormSchema,
  toCreateServiceOrderCommand,
} from "@meguiars/validation";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import type { FieldErrors, FormValues } from "@/components/ClientFields";
import { ChannelFields, QuantityFields } from "@/components/OrderFields";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Card, List } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

interface Resources {
  client: ClientDetail;
  services: CatalogItem[];
  bays: Bay[];
  technicians: Technician[];
}

/** OS walk-in (equivale a /ordenes/nueva en web). */
export function OrderNewScreen({
  state,
  header,
  onOpen,
  onCancel,
}: PrivateScreenProps & { onOpen: (id: string) => void; onCancel: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [requestId] = useState(newRequestId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReturnType<typeof presentSearchResult>[] | null>(null);
  const [resources, setResources] = useState<Resources | null>(null);
  const [values, setValues] = useState<FormValues>({ channel: "b2c" });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const search = async () => {
    if (!client) return;
    const result = await createClientRepository(client).search(center.id, query);
    if (!result.ok) return setError(clientErrorMessage(result.error));
    setError(null);
    setResults(result.data.map((r) => presentSearchResult(r, center.timezone)));
  };

  const choose = async (clientId: string) => {
    if (!client) return;
    const agenda = createAgendaRepository(client);
    const [detail, catalog, bays, technicians] = await Promise.all([
      createClientRepository(client).get(clientId),
      createCatalogRepository(client).listForCenter(center.id),
      agenda.listBays(center.id),
      agenda.listTechnicians(center.id),
    ]);
    if (!detail.ok) return setError(clientErrorMessage(detail.error));
    const active = detail.data.vehicles.filter((v) => v.active);
    if (active.length === 1) set("vehicleId", active[0]!.id);
    setResources({
      client: detail.data,
      services: catalog.ok ? catalog.data : [],
      bays: bays.ok ? bays.data : [],
      technicians: technicians.ok ? technicians.data : [],
    });
  };

  const submit = async () => {
    if (!client || !resources) return;
    const parsed = newOrderFormSchema.safeParse({ ...values, lines: linesFromQuantities(quantities) });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createServiceOrderRepository(client).create(
      toCreateServiceOrderCommand(parsed.data, {
        detailCenterId: center.id,
        requestId,
        clientId: resources.client.id,
        timeZone: center.timezone,
      }),
    );
    setBusy(false);
    if (!result.ok) return setError(orderErrorMessage(result.error));
    toast({ message: ordersCopy.created, tone: "success" });
    onOpen(result.data.id);
  };

  if (!resources) {
    return (
      <Screen title={ordersCopy.newTitle} description={ordersCopy.newDescription} header={header}>
        <LinkButton label={`← ${ordersCopy.title}`} onPress={onCancel} />
        <Card>
          <Field
            label={agendaCopy.clientSearch}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void search()}
            autoCapitalize="none"
          />
          <Button label="Buscar" variant="secondary" onPress={() => void search()} />
          <Notice tone="neutral" text={agendaCopy.noClient} />
        </Card>
        <Notice tone="danger" text={error} />
        {results ? (
          <List
            caption="Clientes"
            rows={results}
            rowKey={(r) => r.id}
            onRowPress={(r) => void choose(r.id)}
            emptyMessage="Sin resultados"
            columns={[
              { key: "name", header: "Cliente", value: (r) => r.name },
              { key: "phone", header: "Teléfono", value: (r) => r.phone },
              { key: "plates", header: "Placas", value: (r) => r.plates },
            ]}
          />
        ) : null}
      </Screen>
    );
  }

  const none = { value: "", label: ordersCopy.none };
  return (
    <Screen title={ordersCopy.newTitle} description={resources.client.fullName} header={header}>
      <LinkButton label={agendaCopy.changeClient} onPress={() => setResources(null)} />
      <Card>
        <Select
          label={ordersCopy.vehicleLabel}
          placeholder="Elige el vehículo"
          options={resources.client.vehicles
            .filter((v) => v.active)
            .map((v) => ({ value: v.id, label: `${v.make} ${v.model} ${v.year} · ${v.plate}` }))}
          value={values.vehicleId ?? ""}
          onChange={(v) => set("vehicleId", v)}
          error={errors.vehicleId}
        />
        <ChannelFields values={values} errors={errors} set={set} />
        <QuantityFields
          services={resources.services}
          quantities={quantities}
          setQuantity={(id, q) => setQuantities((all) => ({ ...all, [id]: q }))}
          error={errors.lines}
        />
        <Select
          label={ordersCopy.bayLabel}
          options={[
            none,
            ...resources.bays.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={values.bayId ?? ""}
          onChange={(v) => set("bayId", v)}
        />
        <Select
          label={ordersCopy.technicianLabel}
          options={[
            none,
            ...resources.technicians.filter((t) => t.active).map((t) => ({ value: t.id, label: t.fullName })),
          ]}
          value={values.technicianId ?? ""}
          onChange={(v) => set("technicianId", v)}
        />
        <Field
          label={ordersCopy.odometerLabel}
          keyboardType="number-pad"
          value={values.odometerKm ?? ""}
          onChangeText={(v) => set("odometerKm", v)}
          error={errors.odometerKm}
        />
        <Field
          label={`${ordersCopy.promisedDate} (AAAA-MM-DD)`}
          keyboardType="numbers-and-punctuation"
          value={values.promisedDate ?? ""}
          onChangeText={(v) => set("promisedDate", v)}
          error={errors.promisedDate}
        />
        <Field
          label={`${ordersCopy.promisedTime} (HH:MM)`}
          keyboardType="numbers-and-punctuation"
          value={values.promisedTime ?? ""}
          onChangeText={(v) => set("promisedTime", v)}
          error={errors.promisedTime}
        />
        <Field
          label={ordersCopy.observationsLabel}
          value={values.observations ?? ""}
          onChangeText={(v) => set("observations", v)}
          error={errors.observations}
        />
        <Notice tone="danger" text={error} />
        <Button label={ordersCopy.submitCreate} loading={busy} onPress={() => void submit()} />
      </Card>
    </Screen>
  );
}
