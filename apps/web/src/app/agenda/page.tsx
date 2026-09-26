import {
  activeCenterAccess,
  addDays,
  agendaCopy,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  canInActiveCenter,
  daySummary,
  formatDateInCenterTimeZone,
  presentAppointment,
  todayIn,
  zonedToUtc,
} from "@meguiars/domain";
import { createAgendaRepository } from "@meguiars/supabase";
import { agendaFilterSchema } from "@meguiars/validation";
import Link from "next/link";
import { AgendaDayList } from "@/components/agenda-day";
import { ResourcesManager } from "@/components/agenda-forms";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const state = await requireScreen("agenda");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  // El "día" es el del centro (zona horaria del centro), no el del navegador ni UTC.
  const parsed = agendaFilterSchema.safeParse({
    day: param("dia") || todayIn(center.timezone),
    status: param("estado"),
    bayId: param("bahia"),
    technicianId: param("tecnico"),
  });
  const filter = parsed.success ? parsed.data : { day: todayIn(center.timezone) };
  const repo = createAgendaRepository((await createSupabaseServerClient())!);
  const [items, bays, technicians] = await Promise.all([
    repo.listDay(center.id, filter.day, filter),
    repo.listBays(center.id),
    repo.listTechnicians(center.id),
  ]);
  const canWrite = canInActiveCenter(state, "agenda.write");
  const canManage = canInActiveCenter(state, "agenda.manage");
  const dayLabel = formatDateInCenterTimeZone(
    zonedToUtc(filter.day, "12:00", center.timezone),
    center.timezone,
  );
  const link = (day: string) => `/agenda?dia=${day}`;

  return (
    <AppShell
      state={state}
      screen="agenda"
      title={`${agendaCopy.title} · ${center.name}`}
      description={agendaCopy.description}
    >
      <Card
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-sm">
              <ButtonLink
                href={`/agenda/nueva?dia=${filter.day}`}
                label={agendaCopy.newAppointment}
                variant="primary"
              />
              <ButtonLink href="/agenda/nueva?walkin=1" label={agendaCopy.walkIn} />
            </div>
          ) : null
        }
      >
        <nav aria-label={agendaCopy.day} className="flex flex-wrap items-center gap-md">
          <Link href={link(addDays(filter.day, -1))} className="underline">
            ← {agendaCopy.previousDay}
          </Link>
          <strong>{dayLabel}</strong>
          <Link href={link(addDays(filter.day, 1))} className="underline">
            {agendaCopy.nextDay} →
          </Link>
          <Link href={link(todayIn(center.timezone))} className="underline">
            {agendaCopy.today}
          </Link>
        </nav>
        <form className="grid gap-sm md:grid-cols-5 md:items-end" action="/agenda">
          <Input name="dia" type="date" label={agendaCopy.day} defaultValue={filter.day} />
          <Select
            name="estado"
            label={agendaCopy.statusFilter}
            options={[
              { value: "", label: agendaCopy.all },
              ...APPOINTMENT_STATUSES.map((s) => ({ value: s, label: APPOINTMENT_STATUS_LABELS[s] })),
            ]}
            defaultValue={filter.status ?? ""}
          />
          <Select
            name="bahia"
            label={agendaCopy.bayFilter}
            options={[
              { value: "", label: agendaCopy.all },
              ...(bays.ok ? bays.data : []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            defaultValue={filter.bayId ?? ""}
          />
          <Select
            name="tecnico"
            label={agendaCopy.technicianFilter}
            options={[
              { value: "", label: agendaCopy.all },
              ...(technicians.ok ? technicians.data : []).map((t) => ({ value: t.id, label: t.fullName })),
            ]}
            defaultValue={filter.technicianId ?? ""}
          />
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            {agendaCopy.filter}
          </button>
        </form>
      </Card>

      {!items.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {items.error.message}
        </p>
      ) : items.data.length === 0 ? (
        <EmptyState title={agendaCopy.empty} />
      ) : (
        <>
          <div className="flex flex-wrap gap-sm" aria-label="Resumen del día">
            {daySummary(items.data).map((s) => (
              <Badge key={s.status} label={`${s.label}: ${s.count}`} />
            ))}
          </div>
          <AgendaDayList items={items.data.map((i) => presentAppointment(i, center.timezone))} />
        </>
      )}

      {canManage && bays.ok && technicians.ok ? (
        <Card title={agendaCopy.resourcesTitle}>
          <ResourcesManager bays={bays.data} technicians={technicians.data} />
        </Card>
      ) : null}
    </AppShell>
  );
}
