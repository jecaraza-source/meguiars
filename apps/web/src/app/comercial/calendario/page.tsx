import {
  activeCenterAccess,
  canInCenter,
  CAMPAIGN_CHANNEL_LABELS,
  CONTENT_FORMAT_LABELS,
  CONTENT_STATUS_LABELS,
  formatTimeInCenterTimeZone,
  groupPostsByDay,
  MARKETING_COPY,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createMarketingRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PostForm, PostStatusForm } from "@/components/marketing-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { calendarWeek } from "@/lib/marketing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Calendario editorial de la semana: planear, programar y registrar lo publicado. */
export default async function ContentCalendarPage({ searchParams }: PageProps<"/comercial/calendario">) {
  const state = await requireScreen("contentCalendar");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const offset = Number(typeof params.semana === "string" ? params.semana : "0") || 0;
  const today = todayIn(center.timezone);
  const week = calendarWeek(today, offset);
  const repo = createMarketingRepository((await createSupabaseServerClient())!);
  const [posts, campaigns] = await Promise.all([
    repo.posts(center.organizationId, week.from, week.to, { detailCenterId: center.id }),
    repo.campaigns(center.organizationId),
  ]);
  const canManage = canInCenter(state, center.id, "marketing.manage");
  const centers = usableCenters(state.access)
    .filter((a) => a.center.organizationId === center.organizationId)
    .map((a) => ({ value: a.center.id, label: a.center.name }));
  const days = posts.ok
    ? groupPostsByDay(posts.data, center.timezone).filter((d) => d.day >= week.from && d.day <= week.to)
    : [];

  return (
    <AppShell
      state={state}
      screen="contentCalendar"
      title={MARKETING_COPY.calendarTitle}
      description={center.name}
    >
      <div className="flex flex-wrap items-center gap-sm">
        <Link href={`/comercial/calendario?semana=${offset - 1}`} className="mg-badge" data-tone="neutral">
          ← Semana anterior
        </Link>
        <span className="text-sm font-medium" data-testid="calendar-week">
          Del {week.from} al {week.to}
        </span>
        <Link href={`/comercial/calendario?semana=${offset + 1}`} className="mg-badge" data-tone="neutral">
          Semana siguiente →
        </Link>
      </div>
      <p className="text-sm text-muted">{MARKETING_COPY.publishNote}</p>
      {!posts.ok ? (
        <EmptyState title={posts.error.message} />
      ) : days.length === 0 ? (
        <EmptyState title={MARKETING_COPY.noPosts} />
      ) : (
        <div className="flex flex-col gap-md" data-testid="calendar">
          {days.map((d) => (
            <Card key={d.day} title={d.day}>
              <ul className="flex flex-col gap-md">
                {d.posts.map((p) => (
                  <li key={p.id} className="flex flex-col gap-xs border-b border-border pb-sm">
                    <div className="flex flex-wrap items-center gap-xs">
                      <span className="font-medium">{p.title}</span>
                      <Badge label={CAMPAIGN_CHANNEL_LABELS[p.channel]} tone="neutral" />
                      <Badge label={CONTENT_FORMAT_LABELS[p.format]} tone="neutral" />
                      <Badge
                        label={
                          p.overdue
                            ? `${CONTENT_STATUS_LABELS[p.status]} · atrasada`
                            : CONTENT_STATUS_LABELS[p.status]
                        }
                        tone={p.status === "publicada" ? "success" : p.overdue ? "warning" : "info"}
                      />
                    </div>
                    <p className="text-sm text-muted">
                      {formatTimeInCenterTimeZone(p.plannedAt, center.timezone)}
                      {p.campaignName ? ` · ${p.campaignName}` : ""}
                      {p.ownerName ? ` · ${p.ownerName}` : ""}
                    </p>
                    {p.copy ? <p className="whitespace-pre-wrap text-sm">{p.copy}</p> : null}
                    {p.linkUrl ? <code className="break-all text-xs">{p.linkUrl}</code> : null}
                    {p.publishedUrl ? (
                      <a href={p.publishedUrl} className="text-sm underline" target="_blank" rel="noreferrer">
                        Ver publicación
                      </a>
                    ) : null}
                    {p.canManage ? <PostStatusForm post={p} /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {canManage ? (
        <Card title={MARKETING_COPY.newPost}>
          <PostForm
            campaigns={(campaigns.ok ? campaigns.data : [])
              .filter((c) => c.status !== "cancelada")
              .map((c) => ({ value: c.id, label: c.name }))}
            centers={centers}
            defaultCenterId={center.id}
            today={today}
          />
        </Card>
      ) : null}
    </AppShell>
  );
}
