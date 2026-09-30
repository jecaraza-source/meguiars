import {
  activeCenterAccess,
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
  const repo = createInboxRepository((await createSupabaseServerClient())!);
  const [list, accounts] = await Promise.all([
    repo.conversations([center.id], {
      status,
      channel,
      assignedTo: mine ? state.user.id : undefined,
      unassigned,
    }),
    repo.accounts(center.organizationId),
  ]);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = {
      estado: status,
      canal: channel,
      mias: mine ? "1" : undefined,
      sinasignar: unassigned ? "1" : undefined,
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
    </AppShell>
  );
}
