import { DAY_COPY } from "@meguiars/domain";
import { createDayRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadDayView } from "@/lib/day";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Operación del día: órdenes en curso, entregas, cobros y citas de hoy del centro activo. */
export default async function OperationPage() {
  const state = await requireScreen("operacion");
  const d = await loadDayView(state, createDayRepository((await createSupabaseServerClient())!));
  return (
    <AppShell
      state={state}
      screen="operacion"
      title={DAY_COPY.title}
      description={`${DAY_COPY.description} · ${d.center.name}`}
    >
      <div className="flex flex-wrap gap-sm">
        {d.canNewOrder ? (
          <ButtonLink href="/ordenes/nueva" label={DAY_COPY.newOrder} variant="primary" size="sm" />
        ) : null}
        {d.canNewAppointment ? (
          <ButtonLink href="/agenda/nueva" label={DAY_COPY.newAppointment} size="sm" />
        ) : null}
      </div>
      {d.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {d.error}
        </p>
      ) : null}
      {d.view ? (
        <>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4" data-testid="day-kpis">
            {d.view.kpis.map((k) => (
              <KpiCard
                key={k.key}
                label={k.label}
                value={k.value}
                {...(k.caption ? { caption: k.caption } : {})}
              />
            ))}
          </div>
          {d.view.showOrders ? (
            <Card title={DAY_COPY.activeTitle}>
              {d.view.active.length === 0 ? (
                <EmptyState title={DAY_COPY.activeEmpty} />
              ) : (
                <ul className="flex flex-col divide-y" data-testid="day-orders">
                  {d.view.active.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-sm py-sm">
                      <div className="flex min-w-0 flex-col gap-xxs">
                        <div className="flex flex-wrap items-center gap-xs">
                          <Link href={o.href} className="font-medium underline">
                            {o.folio}
                          </Link>
                          <Badge label={o.status} tone={o.tone} />
                        </div>
                        <span className="text-sm">
                          {o.client} · {o.vehicle}
                        </span>
                        {o.where || o.promised ? (
                          <span className="text-xs text-muted">
                            {[o.where, o.promised].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-medium">{o.total}</div>
                        <div className="text-xs text-muted">{o.balance}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          {d.view.showAgenda ? (
            <Card
              title={DAY_COPY.agendaTitle}
              actions={
                <Link href="/agenda" className="text-sm underline">
                  Ver agenda
                </Link>
              }
            >
              {d.view.upcoming.length === 0 ? (
                <EmptyState title={DAY_COPY.agendaEmpty} />
              ) : (
                <ul className="flex flex-col divide-y" data-testid="day-agenda">
                  {d.view.upcoming.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-sm py-sm">
                      <span className="shrink-0 font-medium tabular-nums">{a.time}</span>
                      <Link href={a.href} className="min-w-0 flex-1 underline">
                        {a.client} · {a.vehicle}
                      </Link>
                      <Badge label={a.status} tone={a.tone} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
