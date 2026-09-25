import {
  activeCenterAccess,
  agendaCopy,
  canInActiveCenter,
  clientErrorMessage,
  newRequestId,
  presentSearchResult,
  type Bay,
  type CatalogItem,
  type ClientDetail,
  type Technician,
} from "@meguiars/domain";
import { createAgendaRepository, createCatalogRepository, createClientRepository } from "@meguiars/supabase";
import { appointmentFormSchema, fieldErrors, toCreateAppointmentCommand } from "@meguiars/validation";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { DateTimeFields, ScheduleFields } from "@/components/AgendaFields";
import type { FieldErrors, FormValues } from "@/components/ClientFields";
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

export function AppointmentNewScreen({
  state,
  header,
  walkIn,
  day,
  onOpen,
  onCancel,
}: PrivateScreenProps & {
  walkIn: boolean;
  day: string;
  onOpen: (id: string) => void;
  onCancel: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [requestId] = useState(newRequestId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReturnType<typeof presentSearchResult>[] | null>(null);
  const [resources, setResources] = useState<Resources | null>(null);
  const [values, setValues] = useState<FormValues>({ date: day });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const search = async () => {
    if (!client) return;
    const result = await createClientRepository(client).search(center.id, query);
    if (!result.ok) return setError(clientErrorMessage(result.error));
    setError(null);
    setResults(result.data.map((r) => presentSearchResult(r, center.timezone)));
  };

  // Paso 2: el cliente elegido y sus vehículos, sin recapturarlos.
  const choose = async (clientId: string) => {
    if (!client) return;
    const [detail, catalog, bays, technicians] = await Promise.all([
      createClientRepository(client).get(clientId),
      createCatalogRepository(client).listForCenter(center.id),
      createAgendaRepository(client).listBays(center.id),
      createAgendaRepository(client).listTechnicians(center.id),
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
    const parsed = appointmentFormSchema.safeParse({ ...values, serviceIds, walkIn });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createAgendaRepository(client).create(
      toCreateAppointmentCommand(parsed.data, {
        detailCenterId: center.id,
        requestId,
        clientId: resources.client.id,
        timeZone: center.timezone,
      }),
    );
    setBusy(false);
    if (!result.ok) {
      setConflict(result.error.code === "23P01");
      return setError(result.error.code === "23P01" ? agendaCopy.conflict : result.error.message);
    }
    toast({ message: agendaCopy.created, tone: "success" });
    onOpen(result.data.id);
  };

  const title = walkIn ? agendaCopy.walkInTitle : agendaCopy.newTitle;
  if (!resources) {
    return (
      <Screen title={title} description={agendaCopy.newDescription} header={header}>
        <LinkButton label={`← ${agendaCopy.title}`} onPress={onCancel} />
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

  return (
    <Screen title={title} description={resources.client.fullName} header={header}>
      <LinkButton label={agendaCopy.changeClient} onPress={() => setResources(null)} />
      <Card>
        <Select
          label={agendaCopy.vehicleLabel}
          placeholder="Elige el vehículo"
          options={resources.client.vehicles
            .filter((v) => v.active)
            .map((v) => ({ value: v.id, label: `${v.make} ${v.model} ${v.year} · ${v.plate}` }))}
          value={values.vehicleId ?? ""}
          onChange={(v) => set("vehicleId", v)}
          error={errors.vehicleId}
        />
        {walkIn ? null : <DateTimeFields values={values} errors={errors} set={set} />}
        <ScheduleFields
          values={values}
          errors={errors}
          set={set}
          serviceIds={serviceIds}
          setServiceIds={setServiceIds}
          services={resources.services}
          bays={resources.bays}
          technicians={resources.technicians}
        />
        {conflict && canInActiveCenter(state, "agenda.manage") ? (
          <Field
            label={agendaCopy.overrideLabel}
            hint={agendaCopy.overrideHint}
            value={values.overrideReason ?? ""}
            onChangeText={(v) => set("overrideReason", v)}
            error={errors.overrideReason}
          />
        ) : null}
        <Notice tone="danger" text={error} />
        <Button
          label={walkIn ? agendaCopy.submitWalkIn : agendaCopy.submitCreate}
          loading={busy}
          onPress={() => void submit()}
        />
      </Card>
    </Screen>
  );
}
