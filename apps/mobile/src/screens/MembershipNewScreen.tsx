import {
  activeCenterAccess,
  agendaCopy,
  clientErrorMessage,
  formatMoney,
  membershipErrorMessage,
  membershipsCopy,
  newRequestId,
  presentPlan,
  presentSearchResult,
  todayIn,
  type ClientDetail,
  type MembershipPlan,
} from "@meguiars/domain";
import { createClientRepository, createMembershipRepository } from "@meguiars/supabase";
import { createMembershipSchema, fieldErrors } from "@meguiars/validation";
import { useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Card, EmptyState, List } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Alta de membresía (equivale a /comercial/membresias/nueva en web). */
export function MembershipNewScreen({
  state,
  header,
  onOpen,
  onCancel,
}: PrivateScreenProps & { onOpen: (id: string) => void; onCancel: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [requestId] = useState(newRequestId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReturnType<typeof presentSearchResult>[] | null>(null);
  const [chosen, setChosen] = useState<{ client: ClientDetail; plans: MembershipPlan[] } | null>(null);
  const [values, setValues] = useState({ vehicleId: "", planId: "", startsOn: today, paymentReference: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const search = async () => {
    if (!client) return;
    const result = await createClientRepository(client).search(center.id, query);
    if (!result.ok) return setError(clientErrorMessage(result.error));
    setError(null);
    setResults(result.data.map((r) => presentSearchResult(r, center.timezone)));
  };

  const choose = async (clientId: string) => {
    if (!client) return;
    const [detail, plans] = await Promise.all([
      createClientRepository(client).get(clientId),
      createMembershipRepository(client).listPlans(center.organizationId),
    ]);
    if (!detail.ok) return setError(clientErrorMessage(detail.error));
    if (!plans.ok) return setError(plans.error.message);
    const available = plans.data.filter(
      (p) =>
        p.benefits.length > 0 && p.availableFrom <= today && (!p.availableUntil || p.availableUntil >= today),
    );
    const active = detail.data.vehicles.filter((v) => v.active);
    setValues((s) => ({
      ...s,
      vehicleId: active.length === 1 ? active[0]!.id : "",
      planId: available.length === 1 ? available[0]!.id : "",
    }));
    setChosen({ client: detail.data, plans: available });
  };

  const submit = async () => {
    if (!client || !chosen) return;
    const parsed = createMembershipSchema.safeParse({
      ...values,
      detailCenterId: center.id,
      requestId,
      clientId: chosen.client.id,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createMembershipRepository(client).create(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(membershipErrorMessage(result.error));
    toast({ message: membershipsCopy.created, tone: "success" });
    onOpen(result.data.id);
  };

  if (!chosen) {
    return (
      <Screen title={membershipsCopy.newTitle} description={membershipsCopy.newDescription} header={header}>
        <LinkButton label={`← ${membershipsCopy.title}`} onPress={onCancel} />
        <Card>
          <Field
            label={agendaCopy.clientSearch}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void search()}
            autoCapitalize="none"
          />
          <Button label="Buscar" variant="secondary" onPress={() => void search()} />
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

  const vehicles = chosen.client.vehicles.filter((v) => v.active);
  const plan = chosen.plans.find((p) => p.id === values.planId);
  return (
    <Screen title={membershipsCopy.newTitle} description={chosen.client.fullName} header={header}>
      <LinkButton label={agendaCopy.changeClient} onPress={() => setChosen(null)} />
      {chosen.plans.length === 0 ? <EmptyState title="No hay planes disponibles para venta" /> : null}
      {vehicles.length === 0 ? <EmptyState title={membershipsCopy.noVehicles} /> : null}
      {chosen.plans.length > 0 && vehicles.length > 0 ? (
        <Card>
          <Select
            label={membershipsCopy.vehicle}
            options={vehicles.map((v) => ({
              value: v.id,
              label: `${v.make} ${v.model} ${v.year} · ${v.plate}`,
            }))}
            value={values.vehicleId}
            onChange={(v) => set("vehicleId", v)}
            placeholder="Elige el vehículo"
            error={errors.vehicleId}
          />
          <Select
            label={membershipsCopy.plan}
            options={chosen.plans.map((p) => ({
              value: p.id,
              label: `${presentPlan(p).name} · ${presentPlan(p).price}`,
            }))}
            value={values.planId}
            onChange={(v) => set("planId", v)}
            placeholder="Elige el plan"
            error={errors.planId}
          />
          {plan ? (
            <Text style={textStyle("bodySmall", "muted")}>
              {presentPlan(plan).benefits} · {presentPlan(plan).period} · {presentPlan(plan).scope}
              {plan.restrictions ? ` · ${plan.restrictions}` : ""}
            </Text>
          ) : null}
          <Field
            label={`${membershipsCopy.startsOn} (AAAA-MM-DD)`}
            value={values.startsOn}
            onChangeText={(v) => set("startsOn", v)}
            error={errors.startsOn}
          />
          <Field
            label={membershipsCopy.paymentReference}
            hint={membershipsCopy.paymentHint}
            value={values.paymentReference}
            onChangeText={(v) => set("paymentReference", v)}
            error={errors.paymentReference}
          />
          <Notice tone="danger" text={error} />
          <Button
            label={plan ? `${membershipsCopy.create} · ${formatMoney(plan.price)}` : membershipsCopy.create}
            loading={busy}
            onPress={() => void submit()}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
