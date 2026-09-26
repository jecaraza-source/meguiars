import {
  activeCenterAccess,
  canInActiveCenter,
  CONTACT_CHANNELS,
  contactLinks,
  crmCopy,
  newRequestId,
  presentCrmCustomer,
  presentTask,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ConsentForm, NewTaskForm, TaskActions } from "@/components/crm-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ficha comercial: métricas derivadas de OS y membresías, consentimiento y seguimientos. */
export default async function CrmCustomerPage({ params }: PageProps<"/comercial/clientes/[id]">) {
  const state = await requireScreen("crmCustomerDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const centers = usableCenters(state.access).map((a) => a.center.id);
  const repo = createCrmRepository((await createSupabaseServerClient())!);
  const today = todayIn(center.timezone);
  const [customer, tasks, preferences] = await Promise.all([
    repo.getCustomer(id, centers),
    repo.listTasks(centers, { clientId: id, today }),
    repo.preferences(id),
  ]);
  if (!customer.ok) {
    return (
      <AppShell state={state} screen="crmCustomerDetail" title={crmCopy.profileTitle}>
        <EmptyState
          title={crmCopy.notFound}
          action={<ButtonLink href="/comercial/clientes" label={crmCopy.customersTitle} />}
        />
      </AppShell>
    );
  }
  const c = customer.data;
  const view = presentCrmCustomer(c, center.timezone);
  const canWrite = canInActiveCenter(state, "crm.write");
  const links = contactLinks(c);
  const taskRows = tasks.ok ? tasks.data.map((t) => presentTask(t, today)) : [];

  return (
    <AppShell
      state={state}
      screen="crmCustomerDetail"
      title={`${crmCopy.profileTitle} · ${c.fullName}`}
      description={[c.phone, c.email].filter(Boolean).join(" · ")}
    >
      <div className="flex flex-wrap items-center gap-sm">
        <Link href="/comercial/clientes" className="text-sm underline">
          ← {crmCopy.customersTitle}
        </Link>
        <Link href={`/clientes/${c.clientId}`} className="text-sm underline">
          Expediente del cliente
        </Link>
        <Badge label={view.segment} tone={view.segmentTone} />
      </div>
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={crmCopy.lastVisit}
          value={view.lastVisit}
          caption={`${view.visits} ${crmCopy.visits.toLowerCase()}`}
        />
        <KpiCard label={crmCopy.recommendation} value={view.nextVisit} caption={view.nextVisitLabel} />
        <KpiCard
          label={crmCopy.membership}
          value={view.membership}
          caption={c.membershipEndsOn ? `Vence ${c.membershipEndsOn}` : ""}
        />
        <KpiCard label={crmCopy.lifetimeValue} value={view.lifetimeValue} caption={view.valueBreakdown} />
      </div>
      {c.nextVisitOrderId || c.membershipId ? (
        <p className="flex flex-wrap gap-sm text-sm">
          {c.nextVisitOrderId ? (
            <Link href={`/ordenes/${c.nextVisitOrderId}`} className="underline">
              Recomendado en {c.nextVisitFolio ?? "la OS"}
            </Link>
          ) : null}
          {c.membershipId ? (
            <Link href={`/comercial/membresias/${c.membershipId}`} className="underline">
              {crmCopy.membership} {c.membershipNumber}
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-lg lg:grid-cols-2">
        <Card title={crmCopy.consentTitle}>
          {preferences.ok ? (
            <ConsentForm
              clientId={c.clientId}
              channels={CONTACT_CHANNELS}
              preferences={preferences.data}
              canWrite={canWrite}
            />
          ) : (
            <p role="alert" className="text-sm">
              {preferences.error.message}
            </p>
          )}
          {links.length > 0 ? (
            <div className="mt-md flex flex-wrap gap-sm" aria-label={crmCopy.contactManual}>
              <span className="text-sm text-muted">{crmCopy.contactManual}:</span>
              {links.map((l) => (
                <a
                  key={l.channel}
                  href={l.href}
                  className="text-sm underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ) : null}
        </Card>
        {canWrite ? (
          <Card title={crmCopy.newTask}>
            <NewTaskForm
              clientId={c.clientId}
              requestId={newRequestId()}
              optedIn={c.optedInChannels}
              today={today}
            />
          </Card>
        ) : null}
      </div>

      <Card title={`${crmCopy.tasksTitle} (${c.openTasks} abiertos)`}>
        {!tasks.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {tasks.error.message}
          </p>
        ) : taskRows.length === 0 ? (
          <EmptyState title={crmCopy.tasksEmpty} />
        ) : (
          <ul className="flex flex-col gap-md" aria-label={crmCopy.tasksTitle}>
            {taskRows.map((t) => (
              <li key={t.id} className="mg-card flex flex-col gap-xs" data-testid="crm-task">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <strong>{t.what}</strong>
                  <span className="text-sm">
                    {t.due} · {t.status}
                    {t.dueCaption ? ` · ${t.dueCaption}` : ""}
                  </span>
                </div>
                <span className="text-sm text-muted">
                  {t.source}
                  {t.notes ? ` · ${t.notes}` : ""}
                  {t.result ? ` · ${t.result}` : ""}
                </span>
                {t.open && canWrite ? (
                  <TaskActions taskId={t.id} clientId={t.clientId} today={today} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
