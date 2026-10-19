import {
  activeCenterAccess,
  activeTone,
  addDays,
  ASSISTANT_COPY,
  ASSISTANT_MODE_TONES,
  ASSISTANT_MODEL_INFO,
  estimateAssistantCost,
  formatCenterHours,
  formatInCenterTimeZone,
  formatMoney,
  HANDOFF_LABELS,
  type HandoffCode,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import {
  createAssistantRepository,
  createCommercialRepository,
  createInboxRepository,
} from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import {
  AssistantFaqForm,
  AssistantServiceForm,
  AssistantSettingsForm,
  CenterInfoForm,
  DeleteFaqButton,
  HandoffRuleForm,
} from "@/components/assistant-forms";
import { Badge, Card, EmptyState, KpiCard } from "@/components/ui/display";
import { assistantServerReady } from "@/lib/assistant";
import { requireScreen } from "@/lib/auth/dal";
import { channelServerReady } from "@/lib/meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Asistente de WhatsApp: estado real (llave del servidor, cuenta de WhatsApp,
 * modo), indicadores de 30 días con costo estimado, configuración, datos
 * públicos y horario de cada centro, servicios que ofrece, respuestas
 * aprobadas y reglas para pasar la conversación a una persona.
 */
export default async function AssistantPage() {
  const state = await requireScreen("assistant");
  const center = activeCenterAccess(state)!.center;
  const supabase = (await createSupabaseServerClient())!;
  const repo = createAssistantRepository(supabase);
  const orgCenters = usableCenters(state.access).filter(
    (a) => a.center.organizationId === center.organizationId,
  );
  const today = todayIn(center.timezone);
  const from = addDays(today, -29);
  const [settings, centers, services, faqs, rules, metrics, accounts, owners] = await Promise.all([
    repo.settings(center.organizationId),
    repo.centers(center.organizationId),
    repo.services(center.organizationId),
    repo.faqs(center.organizationId),
    repo.handoffRules(center.organizationId),
    repo.metrics(
      orgCenters.map((a) => a.center.id),
      from,
      today,
    ),
    createInboxRepository(supabase).accounts(center.organizationId),
    Promise.all(
      orgCenters.map(async (a) => {
        const r = await createCommercialRepository(supabase).leadOwners(a.center.id);
        return { centerId: a.center.id, owners: r.ok ? r.data : [] };
      }),
    ),
  ]);
  if (!settings.ok || !settings.data) {
    return (
      <AppShell state={state} screen="assistant" title={ASSISTANT_COPY.title}>
        <EmptyState
          title={settings.ok ? "Sin acceso a la configuración del asistente" : settings.error.message}
        />
      </AppShell>
    );
  }
  const s = settings.data;
  const canManage = s.canManage;
  const keyReady = assistantServerReady();
  const metaReady = channelServerReady("whatsapp");
  const wa = (accounts.ok ? accounts.data : []).filter((a) => a.channel === "whatsapp" && a.active);
  const waVerified = wa.some((a) => a.status === "verificada");
  const ownersOf = (centerId: string) =>
    (owners.find((o) => o.centerId === centerId)?.owners ?? []).map((o) => ({
      value: o.userId,
      label: o.fullName,
    }));
  const allOwners = [
    ...new Map(
      owners.flatMap((o) => o.owners).map((o) => [o.userId, { value: o.userId, label: o.fullName }]),
    ).values(),
  ];
  const centerOptions = orgCenters.map((a) => ({ value: a.center.id, label: a.center.name }));

  const m = metrics.ok ? metrics.data : [];
  const sum = (f: (x: (typeof m)[number]) => number) => m.reduce((acc, x) => acc + f(x), 0);
  const turns = sum((x) => x.answered + x.handedOff + x.errors);
  const usage = {
    input: sum((x) => x.inputTokens),
    output: sum((x) => x.outputTokens),
    cacheRead: sum((x) => x.cacheReadTokens),
    cacheWrite: sum((x) => x.cacheWriteTokens),
  };
  const cost = estimateAssistantCost(s.model, usage);
  const handoffs = new Map<HandoffCode, number>();
  for (const x of m)
    for (const [code, n] of Object.entries(x.handoffs))
      handoffs.set(code as HandoffCode, (handoffs.get(code as HandoffCode) ?? 0) + (n ?? 0));
  const pct = (n: number) => (turns ? `${Math.round((n / turns) * 100)} %` : "Sin datos");

  return (
    <AppShell
      state={state}
      screen="assistant"
      title={ASSISTANT_COPY.title}
      description={ASSISTANT_COPY.description}
    >
      <Card title="Estado">
        <dl className="grid gap-xs text-sm md:grid-cols-2" data-testid="assistant-status">
          <dt className="text-muted">Modo</dt>
          <dd>
            <Badge label={ASSISTANT_COPY.modes[s.mode]} tone={ASSISTANT_MODE_TONES[s.mode]} />
          </dd>
          <dt className="text-muted">Modelo</dt>
          <dd>{ASSISTANT_MODEL_INFO[s.model].label}</dd>
          <dt className="text-muted">Llave de Claude en el servidor</dt>
          <dd>{keyReady ? "ANTHROPIC_API_KEY: configurada" : "ANTHROPIC_API_KEY: falta"}</dd>
          <dt className="text-muted">WhatsApp</dt>
          <dd>
            {!metaReady
              ? "Faltan las credenciales de WhatsApp en el servidor"
              : wa.length === 0
                ? "Sin número registrado en Integraciones"
                : waVerified
                  ? `Número verificado: ${wa.map((a) => a.verifiedName ?? a.label).join(", ")}`
                  : "Número registrado, sin verificar con Meta"}
          </dd>
        </dl>
        <ul
          className="mt-md flex list-disc flex-col gap-xs pl-lg text-sm text-muted"
          data-testid="assistant-notes"
        >
          {!keyReady && s.mode !== "apagado" ? <li>{ASSISTANT_COPY.missingKey}</li> : null}
          {!waVerified ? <li>{ASSISTANT_COPY.noMeta}</li> : null}
          <li>{ASSISTANT_COPY.bookingNote[s.selfBooking ? "on" : "off"]}</li>
          {!canManage ? <li>{ASSISTANT_COPY.onlyAdmin}</li> : null}
        </ul>
      </Card>

      <Card title={`Últimos 30 días (${from} a ${today})`}>
        <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-4" data-testid="assistant-metrics">
          <KpiCard label="Mensajes atendidos" value={turns ? String(turns) : "Sin datos"} />
          <KpiCard label="Resueltos por el asistente" value={pct(sum((x) => x.answered))} />
          <KpiCard label="Pasados a una persona" value={pct(sum((x) => x.handedOff))} />
          <KpiCard
            label="Costo estimado de IA"
            value={turns ? `US$${cost.toFixed(2)}` : "Sin datos"}
            caption={ASSISTANT_COPY.costNote}
          />
        </div>
        {handoffs.size ? (
          <ul className="mt-md flex flex-col gap-xs text-sm" data-testid="assistant-handoffs">
            {[...handoffs].map(([code, n]) => (
              <li key={code}>
                {HANDOFF_LABELS[code]}: {n}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Configuración">
        {canManage ? (
          <AssistantSettingsForm settings={s} />
        ) : (
          <dl className="grid gap-xs text-sm md:grid-cols-2">
            <dt className="text-muted">Nombre</dt>
            <dd>{s.assistantName}</dd>
            <dt className="text-muted">Tono</dt>
            <dd>{s.tone}</dd>
            <dt className="text-muted">Horario de personas</dt>
            <dd>{s.humanHours ?? "—"}</dd>
            <dt className="text-muted">Última actualización</dt>
            <dd>{s.updatedAt ? formatInCenterTimeZone(s.updatedAt, center.timezone) : "—"}</dd>
          </dl>
        )}
      </Card>

      <Card title="Centros: dirección, horario y responsable">
        {!centers.ok ? (
          <EmptyState title={centers.error.message} />
        ) : (
          <div className="flex flex-col gap-lg">
            {centers.data
              .filter((c) => c.active)
              .map((c) => (
                <section
                  key={c.detailCenterId}
                  className="flex flex-col gap-sm"
                  data-testid={`center-info-${c.code}`}
                >
                  <h3 className="text-sm font-semibold">
                    {c.name} <span className="text-muted">· {formatCenterHours(c.hours)}</span>
                  </h3>
                  {c.canEdit ? (
                    <CenterInfoForm center={c} owners={ownersOf(c.detailCenterId)} />
                  ) : (
                    <p className="text-sm text-muted">
                      {c.address ?? "Sin dirección"} · Responsable: {c.handoffUserName ?? "sin asignar"}
                    </p>
                  )}
                </section>
              ))}
          </div>
        )}
      </Card>

      <Card title="Servicios que ofrece">
        <p className="mb-sm text-sm text-muted">
          El precio sale del catálogo de cada centro. «Sin valoración»: el cliente puede pedir cita; si no,
          una persona lo valora. «Precio varía por tamaño»: da el precio como «desde» y lo confirma una
          persona.
        </p>
        {!services.ok ? (
          <EmptyState title={services.error.message} />
        ) : services.data.length === 0 ? (
          <EmptyState title="El catálogo no tiene servicios" />
        ) : (
          <ul className="flex flex-col gap-sm" data-testid="assistant-services">
            {services.data
              .filter((x) => x.active)
              .map((x) => (
                <li key={x.serviceId} className="flex flex-col gap-xs border-t border-border pt-sm">
                  <span className="text-sm">
                    <span className="font-medium">{x.name}</span> · {formatMoney(x.basePrice)} ·{" "}
                    {x.durationMinutes} min
                  </span>
                  {canManage ? (
                    <AssistantServiceForm service={x} />
                  ) : (
                    <span className="text-xs text-muted">
                      {x.visible ? "Lo ofrece" : "No lo ofrece"} ·{" "}
                      {x.bookable ? "sin valoración" : "con valoración"}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card title="Respuestas aprobadas">
        {!faqs.ok ? (
          <EmptyState title={faqs.error.message} />
        ) : (
          <div className="flex flex-col gap-md" data-testid="assistant-faqs">
            {faqs.data.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay respuestas aprobadas.</p>
            ) : null}
            {faqs.data.map((f) =>
              canManage ? (
                <div key={f.id} className="flex flex-col gap-xs border-t border-border pt-sm">
                  <AssistantFaqForm faq={f} centers={centerOptions} />
                  <DeleteFaqButton id={f.id} />
                </div>
              ) : (
                <div key={f.id} className="text-sm">
                  <p className="font-medium">{f.question}</p>
                  <p className="text-muted">{f.answer}</p>
                </div>
              ),
            )}
            {canManage ? (
              <div className="border-t border-border pt-sm">
                <AssistantFaqForm centers={centerOptions} />
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card title="Cuándo pasa la conversación a una persona">
        {!rules.ok ? (
          <EmptyState title={rules.error.message} />
        ) : (
          <div className="flex flex-col gap-md" data-testid="assistant-rules">
            {rules.data.map((r) => (
              <section key={r.code} className="flex flex-col gap-xs border-t border-border pt-sm">
                <h3 className="text-sm font-semibold">
                  {r.label} <Badge label={r.active ? "Activa" : "Desactivada"} tone={activeTone(r.active)} />
                </h3>
                {canManage ? (
                  <HandoffRuleForm rule={r} owners={allOwners} />
                ) : (
                  <p className="text-sm text-muted">
                    {r.assignToName ?? "Responsable del centro"} · «{r.message ?? r.defaultMessage}»
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
