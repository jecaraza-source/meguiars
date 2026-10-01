import {
  activeCenterAccess,
  canInCenter,
  CONVERSATION_PRIORITY_LABELS,
  CONVERSATION_STATUS_LABELS,
  INBOX_CHANNEL_LABELS,
  INBOX_CHANNELS,
  INBOX_COPY,
  type ConversationStatus,
  type InboxChannel,
} from "@meguiars/domain";
import { createInboxRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { QuickReplyForm } from "@/components/inbox-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUSES: ConversationStatus[] = ["abierta", "cerrada"];

/** Bandeja unificada del centro activo: WhatsApp, Messenger e Instagram (API oficiales de Meta). */
export default async function InboxPage({ searchParams }: PageProps<"/comercial/bandeja">) {
  const state = await requireScreen("inbox");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const status = (STATUSES.find((s) => s === param("estado")) ?? "abierta") as ConversationStatus;
  const channel = INBOX_CHANNELS.find((c) => c === param("canal")) as InboxChannel | undefined;
  const mine = param("mias") === "1";
  const unassigned = param("sinasignar") === "1";
  const pending = param("pendientes") === "1";
  const tag = param("etiqueta") || undefined;
  const repo = createInboxRepository((await createSupabaseServerClient())!);
  const canManageReplies = canInCenter(state, center.id, "automations.manage");
  const [list, accounts, replies] = await Promise.all([
    repo.conversations([center.id], {
      status,
      channel,
      assignedTo: mine ? state.user.id : undefined,
      unassigned,
      pending,
      tag,
    }),
    repo.accounts(center.organizationId),
    repo.quickReplies(center.organizationId, center.id),
  ]);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = {
      estado: status,
      canal: channel,
      mias: mine ? "1" : undefined,
      sinasignar: unassigned ? "1" : undefined,
      pendientes: pending ? "1" : undefined,
      etiqueta: tag,
      ...patch,
    };
    for (const [k, v] of Object.entries(next)) if (v && !(k === "estado" && v === "abierta")) q.set(k, v);
    const s = q.toString();
    return s ? `/comercial/bandeja?${s}` : "/comercial/bandeja";
  };
  const chip = (on: boolean, label: string, to: string) => (
    <Link
      key={label}
      href={to}
      className="mg-badge"
      data-tone={on ? "brand" : "neutral"}
      aria-current={on ? "page" : undefined}
    >
      {label}
    </Link>
  );
  const hasAccounts = accounts.ok && accounts.data.some((a) => a.detailCenterId === center.id && a.active);

  return (
    <AppShell state={state} screen="inbox" title={INBOX_COPY.title} description={center.name}>
      <div className="flex flex-wrap gap-xs" aria-label="Filtros">
        {STATUSES.map((s) => chip(status === s, CONVERSATION_STATUS_LABELS[s], href({ estado: s })))}
        {chip(mine, "Mías", href({ mias: mine ? undefined : "1", sinasignar: undefined }))}
        {chip(unassigned, "Sin asignar", href({ sinasignar: unassigned ? undefined : "1", mias: undefined }))}
        {chip(pending, "Pendientes", href({ pendientes: pending ? undefined : "1" }))}
        {tag ? chip(true, `Etiqueta: ${tag} ✕`, href({ etiqueta: undefined })) : null}
      </div>
      <div className="flex flex-wrap gap-xs" aria-label="Canal">
        {chip(!channel, "Todos los canales", href({ canal: undefined }))}
        {INBOX_CHANNELS.map((c) => chip(channel === c, INBOX_CHANNEL_LABELS[c], href({ canal: c })))}
      </div>
      {!hasAccounts ? (
        <p className="mg-tone rounded-md border p-md text-sm" data-tone="info">
          {INBOX_COPY.noAccounts}
        </p>
      ) : null}
      {!list.ok ? (
        <EmptyState title={list.error.message} />
      ) : list.data.length === 0 ? (
        <EmptyState title={INBOX_COPY.empty} />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-border" data-testid="conversation-list">
            {list.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-sm py-sm">
                <div className="flex min-w-0 flex-col gap-xs">
                  <Link href={`/comercial/bandeja/${c.id}`} className="font-medium underline">
                    {c.contactName ?? c.contactPhone ?? `Contacto ${INBOX_CHANNEL_LABELS[c.channel]}`}
                  </Link>
                  <span className="truncate text-sm text-muted">{c.lastMessagePreview ?? "—"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-xs">
                  <Badge label={INBOX_CHANNEL_LABELS[c.channel]} tone="neutral" />
                  {c.priority !== "normal" ? (
                    <Badge
                      label={`Prioridad ${CONVERSATION_PRIORITY_LABELS[c.priority].toLowerCase()}`}
                      tone={c.priority === "alta" ? "warning" : "neutral"}
                    />
                  ) : null}
                  {c.pending ? <Badge label="Pendiente" tone="info" /> : null}
                  {c.tags.map((t) => (
                    <Link key={t} href={href({ etiqueta: t })} className="mg-badge" data-tone="neutral">
                      #{t}
                    </Link>
                  ))}
                  {c.notes ? <Badge label={`${c.notes} notas`} tone="neutral" /> : null}
                  {c.unreadCount > 0 ? <Badge label={`${c.unreadCount} sin leer`} tone="brand" /> : null}
                  {c.leadName ? <Badge label={`Prospecto: ${c.leadName}`} tone="info" /> : null}
                  <Badge
                    label={c.windowOpen ? "Ventana abierta" : "Ventana cerrada"}
                    tone={c.windowOpen ? "success" : "warning"}
                  />
                  <span className="text-sm text-muted">{c.assignedName ?? "Sin asignar"}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Respuestas rápidas">
        <p className="text-sm text-muted">
          Se pegan en la caja de respuesta y se pueden editar antes de enviar. Sólo admiten {"{nombre}"} y{" "}
          {"{centro}"}.
        </p>
        <ul className="mt-sm flex flex-col gap-sm" data-testid="quick-replies">
          {(replies.ok ? replies.data : []).map((q) => (
            <li key={q.id} className="flex flex-col gap-xs border-b border-border pb-sm text-sm">
              <span className="font-medium">
                {q.title} {!q.active ? <Badge label="Inactiva" tone="neutral" /> : null}
              </span>
              <span className="text-muted">{q.body}</span>
              {q.canManage ? (
                <details>
                  <summary className="cursor-pointer underline">Editar</summary>
                  <QuickReplyForm
                    reply={q}
                    centers={[
                      { value: "", label: "Todos los centros" },
                      { value: center.id, label: center.name },
                    ]}
                  />
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        {canManageReplies ? (
          <details className="mt-sm">
            <summary className="cursor-pointer text-sm underline">Nueva respuesta rápida</summary>
            <QuickReplyForm
              centers={[
                { value: center.id, label: center.name },
                { value: "", label: "Todos los centros" },
              ]}
            />
          </details>
        ) : null}
      </Card>
    </AppShell>
  );
}
