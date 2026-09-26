import {
  activeCenterAccess,
  crmCopy,
  CUSTOMER_SEGMENTS,
  NEXT_VISIT_LABELS,
  NEXT_VISIT_STATES,
  presentCrmCustomer,
  SEGMENT_LABELS,
  usableCenters,
} from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import { crmCustomerFilterSchema } from "@meguiars/validation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Clientes del CRM: segmento, última visita, próxima recomendación y valor acumulado. */
export default async function CrmCustomersPage({ searchParams }: PageProps<"/comercial/clientes">) {
  const state = await requireScreen("crmCustomers");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const all = param("alcance") === "todos";
  const parsed = crmCustomerFilterSchema.safeParse({
    segment: param("segmento"),
    due: param("proxima"),
    query: param("q"),
  });
  const filter = parsed.success ? parsed.data : {};
  // La base vuelve a filtrar a los centros donde la persona tiene CRM.
  const centers = all ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
  const result = await createCrmRepository((await createSupabaseServerClient())!).listCustomers(
    centers,
    filter,
  );

  return (
    <AppShell
      state={state}
      screen="crmCustomers"
      title={`${crmCopy.customersTitle} · ${all ? crmCopy.allCenters : center.name}`}
      description={crmCopy.customersDescription}
    >
      <Card actions={<ButtonLink href="/comercial/seguimientos" label={crmCopy.tasksTitle} />}>
        <form className="grid gap-sm md:grid-cols-5 md:items-end" action="/comercial/clientes">
          <Select
            name="alcance"
            label={crmCopy.scope}
            options={[
              { value: "", label: center.name },
              { value: "todos", label: crmCopy.allCenters },
            ]}
            defaultValue={all ? "todos" : ""}
          />
          <Select
            name="segmento"
            label={crmCopy.segment}
            options={[
              { value: "", label: crmCopy.allSegments },
              ...CUSTOMER_SEGMENTS.map((s) => ({ value: s, label: SEGMENT_LABELS[s] })),
            ]}
            defaultValue={filter.segment ?? ""}
          />
          <Select
            name="proxima"
            label={crmCopy.nextVisit}
            options={[
              { value: "", label: crmCopy.anyNextVisit },
              ...NEXT_VISIT_STATES.map((s) => ({ value: s, label: NEXT_VISIT_LABELS[s] })),
            ]}
            defaultValue={filter.due ?? ""}
          />
          <Input name="q" type="search" label={crmCopy.search} defaultValue={filter.query ?? ""} />
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            {crmCopy.filter}
          </button>
        </form>
      </Card>
      {!result.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {result.error.message}
        </p>
      ) : result.data.length === 0 ? (
        <EmptyState title={crmCopy.empty} />
      ) : (
        <Table
          caption={crmCopy.customersTitle}
          rows={result.data.map((c) => presentCrmCustomer(c, center.timezone))}
          rowKey={(c) => c.id}
          rowHref={(c) => `/comercial/clientes/${c.id}`}
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
            { key: "value", header: crmCopy.lifetimeValue, value: (c) => c.lifetimeValue, align: "end" },
          ]}
        />
      )}
    </AppShell>
  );
}
