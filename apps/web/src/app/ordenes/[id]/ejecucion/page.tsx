import {
  activeCenterAccess,
  canAddEvidence,
  canInActiveCenter,
  canRecordConsumption,
  consumptionRows,
  executionCopy,
  lineWorkActions,
  ordersCopy,
  presentEvent,
  presentEvidence,
  presentIncident,
  presentLine,
  presentOrder,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createExecutionRepository,
  createServiceOrderRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  ConsumptionTable,
  EvidenceGallery,
  EvidenceUpload,
  Incidents,
  LineWork,
  StaffForm,
} from "@/components/execution-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OrderExecutionPage({ params }: PageProps<"/ordenes/[id]/ejecucion">) {
  const state = await requireScreen("orderExecution");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const supabase = (await createSupabaseServerClient())!;
  const [orderResult, execution, technicians] = await Promise.all([
    createServiceOrderRepository(supabase).get(id),
    createExecutionRepository(supabase).get(id),
    createAgendaRepository(supabase).listTechnicians(center.id),
  ]);
  if (!orderResult.ok || orderResult.data.detailCenterId !== center.id) {
    return (
      <AppShell state={state} screen="orderExecution" title={executionCopy.title}>
        <EmptyState
          title={ordersCopy.notFound}
          action={<ButtonLink href="/ordenes" label={ordersCopy.title} />}
        />
      </AppShell>
    );
  }
  const order = orderResult.data;
  const view = presentOrder(order);
  const back = (
    <Link href={`/ordenes/${order.id}`} className="text-sm underline">
      ← {executionCopy.back} {order.folio}
    </Link>
  );
  if (!execution.ok) {
    return (
      <AppShell state={state} screen="orderExecution" title={executionCopy.title} description={view.title}>
        {back}
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {execution.error.message}
        </p>
      </AppShell>
    );
  }
  const data = execution.data;
  const canWrite = canInActiveCenter(state, "orders.write");
  const techs = technicians.ok ? technicians.data : [];
  const techName = (tid: string) => techs.find((t) => t.id === tid)?.fullName ?? "—";
  const lineName = (lid: string) => data.lines.find((l) => l.id === lid)?.serviceName ?? "—";
  const techOptions = techs.filter((t) => t.active).map((t) => ({ value: t.id, label: t.fullName }));
  const lineOptions = data.lines.map((l) => ({ value: l.id, label: l.serviceName }));
  const openForEvidence = canWrite && canAddEvidence(order.status);

  return (
    <AppShell
      state={state}
      screen="orderExecution"
      title={executionCopy.title}
      description={`${view.title} · ${executionCopy.description}`}
    >
      {back}
      <div className="flex flex-wrap items-center gap-sm">
        <Badge label={view.status} tone={view.tone} />
        {!canAddEvidence(order.status) ? (
          <span className="text-sm text-muted">{executionCopy.closed}</span>
        ) : null}
      </div>

      <Card
        title={executionCopy.linesTitle}
        subtitle={order.status === "en_proceso" ? undefined : executionCopy.needsInProgress}
      >
        <LineWork
          orderId={order.id}
          technicians={techOptions}
          lines={data.lines.map((l) => ({
            ...presentLine(l, techName),
            technicianId: l.technicianId,
            actions: canWrite ? lineWorkActions(l, order.status) : [],
          }))}
        />
      </Card>

      <Card title={executionCopy.staffTitle}>
        {openForEvidence ? (
          <StaffForm
            orderId={order.id}
            technicians={techOptions}
            staffIds={data.staffIds}
            mainTechnicianId={order.technicianId}
          />
        ) : (
          <p className="text-sm">{data.staffIds.map(techName).join(", ") || "—"}</p>
        )}
      </Card>

      <Card title={executionCopy.evidenceTitle}>
        {openForEvidence ? <EvidenceUpload orderId={order.id} lines={lineOptions} /> : null}
        <EvidenceGallery
          orderId={order.id}
          editable={openForEvidence}
          items={data.evidence.map((e) => presentEvidence(e, lineName, center.timezone))}
        />
      </Card>

      <Card
        title={executionCopy.consumptionTitle}
        subtitle={canRecordConsumption(order.status) ? undefined : executionCopy.consumptionClosed}
      >
        <ConsumptionTable
          orderId={order.id}
          rows={consumptionRows(data.lines, data.consumptions)}
          editable={canWrite && canRecordConsumption(order.status)}
        />
      </Card>

      <Card title={executionCopy.incidentsTitle}>
        <Incidents
          orderId={order.id}
          lines={lineOptions}
          editable={openForEvidence}
          incidents={data.incidents.map((i) => presentIncident(i, lineName, center.timezone))}
        />
      </Card>

      <Card title={executionCopy.timelineTitle}>
        <Table
          caption={executionCopy.timelineTitle}
          rows={[...data.events]
            .reverse()
            .map((e) => presentEvent(e, { line: lineName, technician: techName }, center.timezone))}
          rowKey={(e) => e.key}
          emptyMessage="—"
          columns={[
            { key: "when", header: "Fecha", value: (e) => e.when },
            { key: "what", header: "Evento", value: (e) => e.what },
            { key: "note", header: executionCopy.note.replace(" (opcional)", ""), value: (e) => e.note },
          ]}
        />
      </Card>
    </AppShell>
  );
}
