import {
  activeCenterAccess,
  canInCenter,
  CHANNEL_ACCOUNT_STATUS_LABELS,
  COMMERCIAL_COPY,
  formatInCenterTimeZone,
  INBOX_CHANNEL_LABELS,
  INTEGRATION_STATUS_LABELS,
  INTEGRATIONS,
  integrationState,
  usableCenters,
} from "@meguiars/domain";
import { createInboxRepository } from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { ChannelAccountForm, VerifyAccountButton } from "@/components/inbox-forms";
import { Badge, Card } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { metaConfigStatus } from "@/lib/meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Estado real de cada canal. «Conectada» sólo cuando el servidor verificó la
 * cuenta con la API de Meta usando sus credenciales; nunca se pide contraseña
 * de redes sociales ni se guarda un token en la base.
 */
export default async function IntegrationsPage() {
  const state = await requireScreen("integrations");
  const center = activeCenterAccess(state)!.center;
  const repo = createInboxRepository((await createSupabaseServerClient())!);
  const accountsR = await repo.accounts(center.organizationId);
  const accounts = accountsR.ok ? accountsR.data : [];
  const config = metaConfigStatus();
  const isAdmin = canInCenter(state, center.id, "channels.manage");
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://<tu-dominio>";
  const centers = usableCenters(state.access)
    .filter((a) => a.center.organizationId === center.organizationId)
    .map((a) => ({ value: a.center.id, label: a.center.name }));

  return (
    <AppShell state={state} screen="integrations" title={COMMERCIAL_COPY.integrationsTitle}>
      <p className="text-sm text-muted">
        Conexiones oficiales de Meta: WhatsApp Cloud API, Messenger Platform e Instagram Messaging. Los
        mensajes llegan a la Bandeja por un webhook firmado y las respuestas salen desde el servidor con
        tokens que nunca se guardan en la base ni viajan a la app. Nunca se piden contraseñas de redes
        sociales.
      </p>
      <div className="grid gap-md md:grid-cols-2" data-testid="integrations">
        {INTEGRATIONS.map((i) => {
          const s = integrationState(
            i,
            accounts,
            i.inboxChannel ? config.missing.length === 0 && config.channels[i.inboxChannel] : undefined,
          );
          return (
            <Card
              key={i.channel}
              title={i.label}
              actions={
                <Badge
                  label={INTEGRATION_STATUS_LABELS[s.status]}
                  tone={
                    s.status === "conectada"
                      ? "success"
                      : s.status === "pendiente_configurar"
                        ? "warning"
                        : "neutral"
                  }
                />
              }
            >
              <p className="text-sm" data-testid={`integration-${i.channel}`}>
                {s.detail}
              </p>
              {i.scope ? <p className="mt-sm text-sm text-muted">{i.scope}</p> : null}
              {s.status !== "conectada" ? (
                <p className="mt-sm text-sm text-muted">Mientras tanto: {i.manualFlow}</p>
              ) : null}
            </Card>
          );
        })}
      </div>
      {isAdmin ? (
        <>
          <Card title="Configuración del servidor">
            <p className="text-sm">
              URL del webhook para la app de Meta:{" "}
              <code data-testid="webhook-url">{site.replace(/\/$/, "")}/api/webhooks/meta</code>
            </p>
            <ul className="mt-sm flex flex-col gap-xs text-sm" data-testid="server-config">
              <li>
                META_APP_SECRET (firma de webhooks): {config.webhook.appSecret ? "configurada" : "falta"}
              </li>
              <li>
                META_WEBHOOK_VERIFY_TOKEN (verificación del webhook):{" "}
                {config.webhook.verifyToken ? "configurada" : "falta"}
              </li>
              <li>
                SUPABASE_SERVICE_ROLE_KEY (registrar mensajes): {config.serviceKey ? "configurada" : "falta"}
              </li>
              {(["whatsapp", "messenger", "instagram"] as const).map((c) => (
                <li key={c}>
                  {config.tokenEnv[c]} ({INBOX_CHANNEL_LABELS[c]}):{" "}
                  {config.channels[c] ? "configurada" : "falta"}
                </li>
              ))}
            </ul>
            <p className="mt-sm text-xs text-muted">
              Sólo se muestra si existen; los valores nunca salen del servidor.
            </p>
          </Card>
          <Card title="Cuentas oficiales">
            {accounts.length === 0 ? <p className="text-sm text-muted">Sin cuentas registradas.</p> : null}
            <ul className="flex flex-col gap-md" data-testid="channel-accounts">
              {accounts.map((a) => (
                <li key={a.id} className="flex flex-col gap-sm border-b border-border pb-md">
                  <div className="flex flex-wrap items-center gap-sm">
                    <span className="font-medium">{a.label}</span>
                    <Badge label={INBOX_CHANNEL_LABELS[a.channel]} tone="neutral" />
                    <Badge
                      label={CHANNEL_ACCOUNT_STATUS_LABELS[a.status]}
                      tone={
                        a.status === "verificada" ? "success" : a.status === "error" ? "danger" : "warning"
                      }
                    />
                    {!a.active ? <Badge label="Desactivada" tone="neutral" /> : null}
                  </div>
                  <p className="text-sm text-muted">
                    {a.centerName} · id {a.externalAccountId}
                    {a.verifiedName ? ` · ${a.verifiedName}` : ""}
                    {a.lastVerifiedAt
                      ? ` · verificada ${formatInCenterTimeZone(a.lastVerifiedAt, center.timezone)}`
                      : ""}
                    {a.lastWebhookAt
                      ? ` · último webhook ${formatInCenterTimeZone(a.lastWebhookAt, center.timezone)}`
                      : " · sin webhooks recibidos"}
                  </p>
                  {a.lastVerifyError ? (
                    <p className="text-sm" role="alert">
                      {a.lastVerifyError}
                    </p>
                  ) : null}
                  <VerifyAccountButton
                    account={a}
                    disabled={!(config.missing.length === 0 && config.channels[a.channel])}
                  />
                  <details>
                    <summary className="cursor-pointer text-sm underline">Editar</summary>
                    <ChannelAccountForm account={a} centers={centers} />
                  </details>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Registrar cuenta">
            <ChannelAccountForm centers={centers} />
          </Card>
        </>
      ) : null}
    </AppShell>
  );
}
