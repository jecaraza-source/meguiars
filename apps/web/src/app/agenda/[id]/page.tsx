import {
  activeCenterAccess,
  agendaCopy,
  canInActiveCenter,
  canReschedule,
  formatDateInCenterTimeZone,
  presentAppointment,
  presentOrderDraft,
  utcToZoned,
} from "@meguiars/domain";
import { createAgendaRepository, createCatalogRepository } from "@meguiars/supabase";
import Link from "next/link";
import { RescheduleForm, StatusActions } from "@/components/agenda-forms";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppointmentPage({ params, searchParams }: PageProps<"/agenda/[id]">) {
  const state = await requireScreen("appointmentDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const created = (await searchParams).nueva === "1";
  const supabase = (await createSupabaseServerClient())!;
  const repo = createAgendaRepository(supabase);
  const detail = await repo.get(id);
  if (!detail.ok) {
    return (
      <AppShell state={state} screen="appointmentDetail" title={agendaCopy.detailTitle}>
        <EmptyState
          title={agendaCopy.notFound}
          action={<ButtonLink href="/agenda" label={agendaCopy.title} />}
        />
      </AppShell>
    );
  }
  const a = detail.data;
  const view = presentAppointment(a, center.timezone);
  const start = utcToZoned(a.startsAt, center.timezone);
  const canWrite = canInActiveCenter(state, "agenda.write");
  const received = a.status !== "programada" && a.status !== "cancelada" && a.status !== "no_show";
  const [draft, catalog, bays, technicians] = await Promise.all([
    received ? repo.orderDraft(id) : Promise.resolve(null),
    canWrite && canReschedule(a.status) ? createCatalogRepository(supabase).listForCenter(center.id) : null,
    canWrite && canReschedule(a.status) ? repo.listBays(center.id) : null,
    canWrite && canReschedule(a.status) ? repo.listTechnicians(center.id) : null,
  ]);

  return (
    <AppShell
      state={state}
      screen="appointmentDetail"
      title={`${view.client} · ${view.time}`}
      description={`${formatDateInCenterTimeZone(a.startsAt, center.timezone)} · ${view.vehicle}`}
    >
      <Link href={`/agenda?dia=${start.date}`} className="text-sm underline">
        ← {agendaCopy.title}
      </Link>
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {agendaCopy.created}
        </p>
      ) : null}
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={agendaCopy.statusFilter}
          value={view.status}
          caption={view.badges.join(" · ") || undefined}
        />
        <KpiCard label={agendaCopy.servicesLabel} value={String(a.services.length)} caption={view.services} />
        <KpiCard label={agendaCopy.bayFilter} value={view.bay} />
        <KpiCard label={agendaCopy.technicianFilter} value={view.technician} />
      </div>
      {a.notes ? <p className="text-sm">{a.notes}</p> : null}

      {canWrite ? (
        <Card title={agendaCopy.actionsTitle}>
          <Badge label={view.status} tone={view.tone} />
          <StatusActions appointmentId={a.id} status={a.status} />
        </Card>
      ) : null}

      {draft?.ok ? (
        <Card title={agendaCopy.draftTitle} subtitle={agendaCopy.draftSubtitle}>
          <p className="text-sm">
            {view.client} · {view.vehicle}
          </p>
          <Table
            caption={agendaCopy.draftTitle}
            rows={presentOrderDraft(draft.data).lines}
            rowKey={(l) => l.key}
            emptyMessage="—"
            columns={[
              { key: "name", header: "Servicio", value: (l) => l.name },
              { key: "price", header: "Precio", value: (l) => l.price, align: "end" },
            ]}
          />
          <p className="text-right font-semibold">Total {presentOrderDraft(draft.data).total}</p>
        </Card>
      ) : null}

      {catalog?.ok && bays?.ok && technicians?.ok ? (
        <Card title={agendaCopy.rescheduleTitle}>
          <RescheduleForm
            appointmentId={a.id}
            canOverride={canInActiveCenter(state, "agenda.manage")}
            services={catalog.data}
            bays={bays.data}
            technicians={technicians.data}
            initial={{
              serviceIds: a.serviceIds,
              date: start.date,
              time: start.time,
              duration: String(a.durationMinutes),
              bayId: a.bayId ?? "",
              technicianId: a.technicianId ?? "",
              notes: a.notes ?? "",
            }}
          />
        </Card>
      ) : null}
    </AppShell>
  );
}
