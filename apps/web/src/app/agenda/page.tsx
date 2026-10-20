import {
  activeCenterAccess,
  addDays,
  agendaCopy,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  canInActiveCenter,
  daySummary,
  formatDateInCenterTimeZone,
  loadAgendaWeek,
  parseAgendaView,
  presentAppointment,
  todayIn,
  zonedToUtc,
} from "@meguiars/domain";
import { createAgendaRepository, createMyWorkRepository } from "@meguiars/supabase";
import { agendaFilterSchema } from "@meguiars/validation";
import Link from "next/link";
import { AgendaDayList, AgendaWeekBoard } from "@/components/agenda-day";
import { ResourcesManager } from "@/components/agenda-forms";
import { TechnicianUsersForm } from "@/components/work-forms";
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
  const today = todayIn(center.timezone);
  // Por omisión, 7 columnas: el día elegido (hoy) y los 6 siguientes.
  const view = parseAgendaView(param("vista"));
  const step = view === "semana" ? 7 : 1;
  const supabase = (await createSupabaseServerClient())!;
  const repo = createAgendaRepository(supabase);
  const canWrite = canInActiveCenter(state, "agenda.write");
  const canManage = canInActiveCenter(state, "agenda.manage");
  const [items, week, bays, technicians, technicianUsers] = await Promise.all([
    view === "dia" ? repo.listDay(center.id, filter.day, filter) : null,
    view === "semana" ? loadAgendaWeek(repo, center.id, filter.day, today, filter) : null,
    repo.listBays(center.id),
    repo.listTechnicians(center.id),
    canManage ? createMyWorkRepository(supabase).listTechnicianUsers(center.id) : null,
  ]);
  const dayLabel = formatDateInCenterTimeZone(
    zonedToUtc(filter.day, "12:00", center.timezone),
    center.timezone,
  );
  const filterParams = {
    ...(filter.status ? { estado: filter.status } : {}),
    ...(filter.bayId ? { bahia: filter.bayId } : {}),
    ...(filter.technicianId ? { tecnico: filter.technicianId } : {}),
  };
  const link = (day: string, v = view) =>
    `/agenda?${new URLSearchParams({ vista: v, dia: day, ...filterParams }).toString()}`;
  const loadError = items && !items.ok ? items.error.message : week && !week.ok ? week.error.message : null;

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
        <nav aria-label="Vista" className="flex flex-wrap items-center gap-sm text-sm">
          <Link
            href={link(filter.day, "semana")}
            aria-current={view === "semana" ? "page" : undefined}
            className="underline aria-[current=page]:font-bold aria-[current=page]:no-underline"
          >
            7 días
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href={link(filter.day, "dia")}
            aria-current={view === "dia" ? "page" : undefined}
            className="underline aria-[current=page]:font-bold aria-[current=page]:no-underline"
          >
            Día
          </Link>
        </nav>
        <nav aria-label={agendaCopy.day} className="flex flex-wrap items-center gap-md">
          <Link href={link(addDays(filter.day, -step))} className="underline">
            ← {view === "semana" ? "7 días antes" : agendaCopy.previousDay}
          </Link>
          <strong>{view === "semana" ? `${dayLabel} y 6 días siguientes` : dayLabel}</strong>
          <Link href={link(addDays(filter.day, step))} className="underline">
            {view === "semana" ? "7 días después" : agendaCopy.nextDay} →
          </Link>
          <Link href={link(today)} className="underline">
            {agendaCopy.today}
          </Link>
        </nav>
        <form className="grid gap-sm md:grid-cols-5 md:items-end" action="/agenda">
          <input type="hidden" name="vista" value={view} />
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

      {loadError ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {loadError}
        </p>
      ) : week?.ok ? (
        <AgendaWeekBoard
          days={week.data.map((d) => ({
            day: d.day,
            label: d.label,
            isToday: d.isToday,
            href: link(d.day, "dia"),
            items: d.items.map((i) => presentAppointment(i, center.timezone)),
          }))}
        />
      ) : items?.ok && items.data.length === 0 ? (
        <EmptyState title={agendaCopy.empty} />
      ) : items?.ok ? (
        <>
          <div className="flex flex-wrap gap-sm" aria-label="Resumen del día">
            {daySummary(items.data).map((s) => (
              <Badge key={s.status} label={`${s.label}: ${s.count}`} />
            ))}
          </div>
          <AgendaDayList items={items.data.map((i) => presentAppointment(i, center.timezone))} />
        </>
      ) : null}

      {canManage && bays.ok && technicians.ok ? (
        <Card title={agendaCopy.resourcesTitle}>
          <ResourcesManager bays={bays.data} technicians={technicians.data} />
        </Card>
      ) : null}
      {canManage && technicians.ok && technicianUsers?.ok ? (
        <Card title="Técnicos y su usuario («Mi día»)">
          <TechnicianUsersForm technicians={technicians.data} users={technicianUsers.data} />
        </Card>
      ) : null}
    </AppShell>
  );
}
