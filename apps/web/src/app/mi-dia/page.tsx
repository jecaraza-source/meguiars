import {
  activeCenterAccess,
  addDays,
  EVIDENCE_KIND_LABELS,
  formatTimeInCenterTimeZone,
  ITEM_WORK_LABELS,
  ITEM_WORK_TONES,
  MY_WORK_COPY,
  MY_WORK_STATE_LABELS,
  MY_WORK_STATE_TONES,
  myWorkSummary,
  nextActionOf,
  orderProgress,
  orderStateOf,
  orderTimeLabel,
  sortOrders,
  todayIn,
  vehicleLabel,
} from "@meguiars/domain";
import { createMyWorkRepository } from "@meguiars/supabase";
import { myWorkDaySchema } from "@meguiars/validation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { MyWorkItemButtons, MyWorkNoteForm } from "@/components/work-forms";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** «Mi día» del técnico / lavador. Las fotos se toman con la app móvil (cámara). */
export default async function MyWorkPage({ searchParams }: PageProps<"/mi-dia">) {
  const state = await requireScreen("myWork");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const today = todayIn(center.timezone);
  const parsed = myWorkDaySchema.safeParse({
    detailCenterId: center.id,
    day: typeof params.dia === "string" ? params.dia : "",
  });
  const day = (parsed.success ? parsed.data.day : undefined) ?? today;
  const repo = createMyWorkRepository((await createSupabaseServerClient())!);
  const result = await repo.get(center.id, day);
  const data = result.ok ? result.data : null;
  const orders = data ? sortOrders(data.orders) : [];
  const tomorrow = addDays(today, 1);

  return (
    <AppShell
      state={state}
      screen="myWork"
      title={MY_WORK_COPY.title}
      description={data ? myWorkSummary(data) : undefined}
    >
      <div className="flex flex-wrap gap-sm">
        <ButtonLink
          href="/mi-dia"
          label={MY_WORK_COPY.today}
          variant={day === today ? "primary" : "secondary"}
        />
        <ButtonLink
          href={`/mi-dia?dia=${tomorrow}`}
          label={MY_WORK_COPY.tomorrow}
          variant={day === tomorrow ? "primary" : "secondary"}
        />
      </div>
      {!result.ok ? (
        <EmptyState
          title={result.error.kind === "permission_denied" ? MY_WORK_COPY.notLinked : result.error.message}
        />
      ) : null}
      {data && orders.length === 0 && data.appointments.length === 0 ? (
        <EmptyState title={MY_WORK_COPY.emptyDay} />
      ) : null}

      <div className="grid gap-lg lg:grid-cols-2">
        {orders.map((order) => {
          const st = orderStateOf(order);
          const progress = orderProgress(order);
          const closed = st === "terminada";
          return (
            <Card
              key={order.id}
              title={vehicleLabel(order.vehicle)}
              subtitle={[orderTimeLabel(order, center.timezone), order.bay, order.folio]
                .filter(Boolean)
                .join(" · ")}
            >
              <div className="flex flex-col gap-md">
                <div className="flex flex-wrap items-center gap-sm">
                  <Badge label={MY_WORK_STATE_LABELS[st]} tone={MY_WORK_STATE_TONES[st]} />
                  <span className="text-sm text-muted">
                    {progress.done} de {progress.total} servicios
                  </span>
                  {order.openProblems > 0 ? (
                    <Badge label={`${MY_WORK_COPY.openProblems}: ${order.openProblems}`} tone="danger" />
                  ) : null}
                </div>
                {order.observations ? (
                  <div className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
                    <p className="font-semibold">{MY_WORK_COPY.instructions}</p>
                    <p>{order.observations}</p>
                  </div>
                ) : null}
                <ul className="flex flex-col gap-md">
                  {order.items.map((item) => {
                    const next = nextActionOf(item);
                    return (
                      <li key={item.id} className="flex flex-col gap-sm border-t border-border pt-sm">
                        <div className="flex items-center justify-between gap-sm">
                          <span className="text-lg font-semibold">
                            {item.quantity > 1 ? `${item.quantity} × ` : ""}
                            {item.name}
                          </span>
                          <Badge label={ITEM_WORK_LABELS[item.status]} tone={ITEM_WORK_TONES[item.status]} />
                        </div>
                        {next && !closed ? (
                          <MyWorkItemButtons itemId={item.id} canStart={next === "start"} />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-sm text-muted">
                  {MY_WORK_COPY.photos}:{" "}
                  {order.photos.length > 0
                    ? order.photos.map((p) => EVIDENCE_KIND_LABELS[p.kind]).join(", ")
                    : "sin fotos"}{" "}
                  · se toman con la app móvil.
                </p>
                {order.comments.length > 0 ? (
                  <ul className="flex flex-col gap-xs text-sm">
                    {order.comments.map((c, i) => (
                      <li key={`${c.at}-${i}`}>
                        {formatTimeInCenterTimeZone(c.at, center.timezone)}
                        {c.by ? ` · ${c.by}` : ""}: {c.note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <MyWorkNoteForm orderId={order.id} allowProblem={!closed} />
              </div>
            </Card>
          );
        })}
        {data?.appointments.map((a) => (
          <Card
            key={a.id}
            title={vehicleLabel(a.vehicle)}
            subtitle={[formatTimeInCenterTimeZone(a.startsAt, center.timezone), a.bay]
              .filter(Boolean)
              .join(" · ")}
          >
            <div className="flex flex-col gap-sm text-sm">
              <Badge label={MY_WORK_COPY.waitingCar} tone="info" />
              {a.services.length > 0 ? <p>{a.services.join(", ")}</p> : null}
              {a.notes ? <p className="text-muted">{a.notes}</p> : null}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
