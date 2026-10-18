import {
  activeCenterAccess,
  CONVERSATION_PRIORITY_LABELS,
  CONVERSATION_PRIORITY_TONES,
  CONVERSATION_STATUS_LABELS,
  CONVERSATION_STATUS_TONES,
  formatDateInCenterTimeZone,
  formatInCenterTimeZone,
  historyDisplayName,
  INBOX_CHANNEL_LABELS,
  INBOX_CHANNELS,
} from "@meguiars/domain";
import { createInboxRepository, HISTORY_LIMIT } from "@meguiars/supabase";
import { conversationHistorySchema } from "@meguiars/validation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Historial de conversaciones del centro activo: todas las guardadas (abiertas
 * y atendidas), con búsqueda por cliente y por teléfono. Los filtros viven en
 * la URL para poder compartir la búsqueda.
 */
export default async function ConversationHistoryPage({ searchParams }: PageProps<"/comercial/historial">) {
  const state = await requireScreen("conversationHistory");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const raw = {
    client: param("cliente"),
    phone: param("telefono"),
    channel: param("canal") || undefined,
    status: param("estado") || undefined,
    from: param("desde"),
    to: param("hasta"),
  };
  const parsed = conversationHistorySchema.safeParse(raw);
  const errors = parsed.success
    ? {}
    : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
  const repo = createInboxRepository((await createSupabaseServerClient())!);
  const list = parsed.success ? await repo.history([center.id], parsed.data) : null;
  const tz = center.timezone;
  const filtered = Object.values(raw).some(Boolean);

  return (
    <AppShell
      state={state}
      screen="conversationHistory"
      title="Historial de conversaciones"
      description={center.name}
    >
      <Card title="Buscar">
        <form method="get" className="grid gap-sm md:grid-cols-3" role="search" noValidate>
          <Input
            name="cliente"
            label="Cliente"
            hint="Nombre o apellido, en cualquier orden"
            defaultValue={raw.client}
            error={errors.client}
          />
          <Input
            name="telefono"
            label="Teléfono"
            hint="Con o sin lada; al menos 4 dígitos"
            inputMode="tel"
            defaultValue={raw.phone}
            error={errors.phone}
          />
          <Select
            name="canal"
            label="Canal"
            defaultValue={raw.channel ?? ""}
            options={[
              { value: "", label: "Todos" },
              ...INBOX_CHANNELS.map((c) => ({ value: c, label: INBOX_CHANNEL_LABELS[c] })),
            ]}
            error={errors.channel}
          />
          <Select
            name="estado"
            label="Estado"
            defaultValue={raw.status ?? ""}
            options={[
              { value: "", label: "Todas" },
              { value: "abierta", label: CONVERSATION_STATUS_LABELS.abierta },
              { value: "cerrada", label: CONVERSATION_STATUS_LABELS.cerrada },
            ]}
            error={errors.status}
          />
          <Input name="desde" label="Desde" type="date" defaultValue={raw.from} error={errors.from} />
          <Input name="hasta" label="Hasta" type="date" defaultValue={raw.to} error={errors.to} />
          <div className="flex flex-wrap items-end gap-sm md:col-span-3">
            <Button type="submit" label="Buscar" />
            {filtered ? <ButtonLink href="/comercial/historial" label="Limpiar" variant="secondary" /> : null}
          </div>
        </form>
      </Card>

      {!list ? null : !list.ok ? (
        <EmptyState title={list.error.message} />
      ) : list.data.length === 0 ? (
        <EmptyState
          title={filtered ? "Sin conversaciones con esos filtros" : "Aún no hay conversaciones"}
          message={
            filtered
              ? "Prueba con menos palabras o sólo los últimos dígitos del teléfono."
              : "Aquí aparecen todas las conversaciones de WhatsApp, Messenger e Instagram del centro."
          }
        />
      ) : (
        <Card
          title={`${list.data.length} conversaciones${list.data.length === HISTORY_LIMIT ? ` (las ${HISTORY_LIMIT} más recientes)` : ""}`}
        >
          <ul className="flex flex-col divide-y divide-border" data-testid="conversation-history">
            {list.data.map((e) => (
              <li key={e.id} className="flex flex-col gap-xs py-sm">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <Link href={`/comercial/bandeja/${e.id}`} className="font-medium underline">
                    {historyDisplayName(e)}
                  </Link>
                  <div className="flex flex-wrap items-center gap-xs">
                    <Badge label={INBOX_CHANNEL_LABELS[e.channel]} tone="neutral" />
                    <Badge
                      label={CONVERSATION_STATUS_LABELS[e.status]}
                      tone={CONVERSATION_STATUS_TONES[e.status]}
                    />
                    <Badge
                      label={`Prioridad ${CONVERSATION_PRIORITY_LABELS[e.priority].toLowerCase()}`}
                      tone={CONVERSATION_PRIORITY_TONES[e.priority]}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted">
                  {[
                    e.contactPhone,
                    e.contactName && e.contactName !== historyDisplayName(e)
                      ? `WhatsApp: ${e.contactName}`
                      : null,
                    `${e.messagesIn} recibidos · ${e.messagesOut} enviados`,
                    `Desde ${formatDateInCenterTimeZone(e.startedAt, tz)}`,
                    `Último: ${formatInCenterTimeZone(e.lastMessageAt, tz)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {e.lastMessagePreview ? <p className="truncate text-sm">{e.lastMessagePreview}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
