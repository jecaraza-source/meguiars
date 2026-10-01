import {
  activeCenterAccess,
  canInCenter,
  CONVERSATION_PRIORITY_LABELS,
  CONVERSATION_STATUS_LABELS,
  formatInCenterTimeZone,
  INBOX_CHANNEL_LABELS,
  INBOX_COPY,
  MESSAGE_STATUS_LABELS,
  replyBlocker,
  usableCenters,
  windowRemaining,
} from "@meguiars/domain";
import {
  createCatalogRepository,
  createCommercialRepository,
  createInboxRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  AssignConversationForm,
  ConversationLeadForm,
  ConversationStatusForm,
  LinkConversationLeadForm,
  NoteForm,
  ReplyForm,
  TemplateForm,
  TriageForm,
} from "@/components/inbox-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { channelServerReady } from "@/lib/meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Conversación: hilo, respuesta dentro de la ventana de 24 h, responsable y prospecto. */
export default async function ConversationPage({ params }: PageProps<"/comercial/bandeja/[id]">) {
  const state = await requireScreen("conversation");
  const { id } = await params;
  const center = activeCenterAccess(state)!.center;
  const supabase = (await createSupabaseServerClient())!;
  const repo = createInboxRepository(supabase);
  const r = await repo.conversation(
    id,
    usableCenters(state.access).map((a) => a.center.id),
  );
  if (!r.ok) {
    return (
      <AppShell state={state} screen="conversation" title={INBOX_COPY.title}>
        <Link href="/comercial/bandeja" className="text-sm underline">
          ← Bandeja
        </Link>
        <EmptyState title={r.error.message} />
      </AppShell>
    );
  }
  const c = r.data;
  const commercial = createCommercialRepository(supabase);
  const [messages, owners, leads, catalog, notes, quickReplies, templates, lead] = await Promise.all([
    repo.messages(c.id),
    commercial.leadOwners(c.detailCenterId),
    c.leadId ? Promise.resolve(null) : commercial.leads([c.detailCenterId], { status: "abierta" }),
    c.leadId ? Promise.resolve(null) : createCatalogRepository(supabase).listForCenter(c.detailCenterId),
    repo.notes(c.id),
    repo.quickReplies(center.organizationId, c.detailCenterId),
    c.channel === "whatsapp" ? repo.templates(center.organizationId) : Promise.resolve(null),
    c.leadId ? commercial.lead(c.leadId, [c.detailCenterId]) : Promise.resolve(null),
  ]);
  // Consentimiento de WhatsApp para plantillas de marketing: el del prospecto ligado; con
  // un cliente, la base lo vuelve a validar al enviar.
  const whatsappConsent = lead?.ok ? lead.data.consentChannels.includes("whatsapp") : !!c.clientId;
  const tz =
    usableCenters(state.access).find((a) => a.center.id === c.detailCenterId)?.center.timezone ??
    center.timezone;
  const canWrite = canInCenter(state, c.detailCenterId, "leads.use");
  const blocker = replyBlocker(c);
  const serverReady = channelServerReady(c.channel);
  const remaining = windowRemaining(c.lastInboundAt);
  const who = c.contactName ?? c.contactPhone ?? `Contacto de ${INBOX_CHANNEL_LABELS[c.channel]}`;

  return (
    <AppShell
      state={state}
      screen="conversation"
      title={who}
      description={`${INBOX_CHANNEL_LABELS[c.channel]} · ${c.accountLabel}`}
    >
      <Link href="/comercial/bandeja" className="text-sm underline">
        ← Bandeja
      </Link>
      <div className="grid gap-md lg:grid-cols-3">
        <div className="flex flex-col gap-md lg:col-span-2">
          <Card title="Mensajes">
            {!messages.ok ? (
              <EmptyState title={messages.error.message} />
            ) : (
              <ol className="flex flex-col gap-sm" data-testid="message-thread">
                {messages.data.map((m) => (
                  <li
                    key={m.id}
                    className={`mg-tone max-w-prose rounded-md border p-sm text-sm ${m.direction === "saliente" ? "self-end" : "self-start"}`}
                    data-tone={m.direction === "saliente" ? "brand" : "neutral"}
                  >
                    <p className="whitespace-pre-wrap">{m.body ?? INBOX_COPY.mediaNotice}</p>
                    <p
                      className={`mt-xs text-xs ${m.direction === "saliente" ? "opacity-80" : "text-muted"}`}
                    >
                      {formatInCenterTimeZone(m.occurredAt, tz)}
                      {m.direction === "saliente"
                        ? ` · ${m.sentByName ?? ""} · ${MESSAGE_STATUS_LABELS[m.status]}`
                        : ""}
                    </p>
                    {m.error ? (
                      <p className="text-xs" role="alert">
                        {m.error}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Responder">
            {!canWrite ? (
              <p className="text-sm text-muted">Sin permiso para responder.</p>
            ) : blocker ? (
              <div className="flex flex-col gap-md">
                <p
                  className="mg-tone rounded-md border p-md text-sm"
                  data-tone="warning"
                  data-testid="reply-blocked"
                >
                  {blocker}
                </p>
                {c.channel === "whatsapp" && c.accountStatus === "verificada" && serverReady ? (
                  <TemplateForm
                    conversation={c}
                    templates={templates?.ok ? templates.data : []}
                    whatsappConsent={whatsappConsent}
                  />
                ) : null}
              </div>
            ) : !serverReady ? (
              <p className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
                {INBOX_COPY.sendUnavailable}
              </p>
            ) : (
              <>
                <p className="mb-sm text-sm text-muted" data-testid="window-remaining">
                  Ventana abierta: quedan {remaining!.hours} h {remaining!.minutes} min para responder con
                  texto libre.
                </p>
                <ReplyForm
                  conversation={c}
                  quickReplies={quickReplies.ok ? quickReplies.data : []}
                  centerName={c.centerName}
                />
              </>
            )}
            <p className="mt-sm text-xs text-muted">{INBOX_COPY.notMirrored}</p>
          </Card>
          <Card title="Notas internas (no se envían al cliente)">
            <div className="mg-tone flex flex-col gap-sm rounded-md border p-sm" data-tone="warning">
              <p className="text-xs">{INBOX_COPY.notesNote}</p>
              {notes.ok && notes.data.length ? (
                <ul className="flex flex-col gap-xs text-sm" data-testid="conversation-notes">
                  {notes.data.map((n) => (
                    <li key={n.id}>
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="text-xs opacity-80">
                        {n.authorName ?? "—"} · {formatInCenterTimeZone(n.createdAt, tz)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">Sin notas.</p>
              )}
              {canWrite ? <NoteForm conversation={c} /> : null}
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-md">
          <Card title="Contacto">
            <dl className="grid gap-xs text-sm" data-testid="conversation-summary">
              <dt className="text-muted">Estado</dt>
              <dd>
                <Badge
                  label={CONVERSATION_STATUS_LABELS[c.status]}
                  tone={c.status === "abierta" ? "brand" : "neutral"}
                />
              </dd>
              <dt className="text-muted">Prioridad</dt>
              <dd>
                <Badge
                  label={CONVERSATION_PRIORITY_LABELS[c.priority]}
                  tone={c.priority === "alta" ? "warning" : "neutral"}
                />
                {c.pending ? <Badge label="Pendiente" tone="info" /> : null}
              </dd>
              <dt className="text-muted">Etiquetas</dt>
              <dd>{c.tags.length ? c.tags.join(", ") : "—"}</dd>
              <dt className="text-muted">Teléfono</dt>
              <dd>{c.contactPhone ?? "No compartido por Meta"}</dd>
              <dt className="text-muted">Responsable</dt>
              <dd>{c.assignedName ?? "Sin asignar"}</dd>
              <dt className="text-muted">Prospecto</dt>
              <dd>
                {c.leadId ? (
                  <Link href={`/comercial/prospectos/${c.leadId}`} className="underline">
                    {c.leadName}
                  </Link>
                ) : (
                  "Sin ligar"
                )}
              </dd>
            </dl>
            {canWrite ? (
              <div className="mt-md flex flex-col gap-sm">
                <AssignConversationForm conversation={c} owners={owners.ok ? owners.data : []} />
                <ConversationStatusForm conversation={c} />
                <TriageForm conversation={c} />
              </div>
            ) : null}
          </Card>
          {canWrite && !c.leadId ? (
            <Card title="Registrar como prospecto">
              <ConversationLeadForm
                conversation={c}
                services={(catalog?.ok ? catalog.data : []).map((s) => ({ value: s.id, label: s.name }))}
              />
              <div className="mt-md">
                <LinkConversationLeadForm
                  conversation={c}
                  leads={(leads?.ok ? leads.data : []).map((l) => ({
                    value: l.id,
                    label: `${l.fullName} · ${l.stageName}`,
                  }))}
                />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
