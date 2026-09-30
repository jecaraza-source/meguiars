import {
  activeCenterAccess,
  canInCenter,
  COMMERCIAL_COPY,
  formatDateOnly,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  type LeadSource,
  type LeadStatus,
} from "@meguiars/domain";
import { createCommercialRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LeadStageForm } from "@/components/commercial-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadLeadsBoard } from "@/lib/commercial";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUSES: LeadStatus[] = ["abierta", "ganada", "perdida"];

/** Prospectos del centro activo: tablero por etapa, filtros por canal, estado y responsable. */
export default async function LeadsPage({ searchParams }: PageProps<"/comercial/prospectos">) {
  const state = await requireScreen("leads");
  const active = activeCenterAccess(state)!;
  const center = active.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const status = (STATUSES.find((s) => s === param("estado")) ?? "abierta") as LeadStatus;
  const source = LEAD_SOURCES.find((s) => s === param("canal")) as LeadSource | undefined;
  const mine = param("mios") === "1" ? state.user.id : undefined;
  const query = param("q") || undefined;
  const repo = createCommercialRepository((await createSupabaseServerClient())!);
  const board = await loadLeadsBoard(repo, center.organizationId, [center.id], {
    status,
    source,
    ownerId: mine,
    query,
  });
  const canManageStages = active.corporateRoles.includes("admin_socio");
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { estado: status, canal: source, mios: mine ? "1" : undefined, q: query, ...patch };
    for (const [k, v] of Object.entries(next)) if (v && !(k === "estado" && v === "abierta")) q.set(k, v);
    const s = q.toString();
    return s ? `/comercial/prospectos?${s}` : "/comercial/prospectos";
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

  return (
    <AppShell state={state} screen="leads" title={COMMERCIAL_COPY.leadsTitle} description={center.name}>
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex flex-wrap gap-xs" aria-label="Filtros">
          {STATUSES.map((s) => chip(status === s, LEAD_STATUS_LABELS[s], href({ estado: s })))}
          {chip(!!mine, "Míos", href({ mios: mine ? undefined : "1" }))}
        </div>
        {canInCenter(state, center.id, "leads.use") ? (
          <ButtonLink href="/comercial/prospectos/nuevo" label={COMMERCIAL_COPY.newLead} />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-xs" aria-label="Canal de origen">
        {chip(!source, "Todos los canales", href({ canal: undefined }))}
        {LEAD_SOURCES.map((s) => chip(source === s, LEAD_SOURCE_LABELS[s], href({ canal: s })))}
      </div>
      <form className="flex flex-wrap items-end gap-sm" action="/comercial/prospectos">
        {status !== "abierta" ? <input type="hidden" name="estado" value={status} /> : null}
        {source ? <input type="hidden" name="canal" value={source} /> : null}
        <label className="flex flex-col gap-xs text-sm">
          Buscar
          <input
            name="q"
            defaultValue={query ?? ""}
            placeholder="Nombre, teléfono, email o @usuario"
            className="mg-input"
          />
        </label>
        <button type="submit" className="mg-badge" data-tone="neutral">
          Buscar
        </button>
      </form>

      {board.error ? (
        <EmptyState title="No se pudieron cargar los prospectos" message={board.error} />
      ) : (
        <>
          {status === "abierta" && board.counters ? (
            <div className="grid gap-md md:grid-cols-3" data-testid="lead-counters">
              <KpiCard label="Prospectos abiertos" value={String(board.counters.open)} />
              <KpiCard
                label="Sin contactar"
                value={String(board.counters.uncontacted)}
                caption="Responde primero a estos"
              />
              <KpiCard label="Acción vencida" value={String(board.counters.overdue)} />
            </div>
          ) : null}
          {board.leads.length === 0 ? (
            <EmptyState title={COMMERCIAL_COPY.leadsEmpty} />
          ) : status === "abierta" ? (
            <div className="grid gap-md md:grid-cols-2 xl:grid-cols-3" data-testid="lead-board">
              {board.columns
                .filter((c) => c.stage.kind === "abierta")
                .map((c) => (
                  <Card key={c.stage.id} title={`${c.stage.name} (${c.leads.length})`}>
                    {c.leads.length === 0 ? (
                      <p className="text-sm text-muted">—</p>
                    ) : (
                      <ul className="flex flex-col gap-sm">
                        {c.leads.map((l) => (
                          <li
                            key={l.id}
                            className="flex flex-col gap-xxs border-b border-border pb-sm text-sm"
                            data-testid="lead-card"
                          >
                            <Link href={`/comercial/prospectos/${l.id}`} className="font-medium underline">
                              {l.fullName}
                            </Link>
                            <span className="text-muted">
                              {l.sourceLabel} · {l.interestLabel}
                            </span>
                            <span className="flex flex-wrap gap-xs">
                              {l.uncontacted ? <Badge label="Sin contactar" tone="warning" /> : null}
                              {l.nextActionLabel && l.nextActionTone !== "neutral" ? (
                                <Badge label={l.nextActionLabel} tone={l.nextActionTone ?? "neutral"} />
                              ) : null}
                              {l.ownerName ? <Badge label={l.ownerName} tone="neutral" /> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-sm" aria-label="Prospectos cerrados">
              {board.leads.map((l) => (
                <li key={l.id} className="mg-card flex flex-col gap-xxs text-sm">
                  <Link href={`/comercial/prospectos/${l.id}`} className="font-medium underline">
                    {l.fullName}
                  </Link>
                  <span className="text-muted">
                    {l.sourceLabel} · {l.closedAt ? formatDateOnly(l.closedAt.slice(0, 10)) : ""} ·{" "}
                    {l.status === "ganada" ? `Venta ${l.wonLabel}` : (l.lossLabel ?? "")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {canManageStages ? (
        <details className="mg-card">
          <summary className="cursor-pointer font-medium">Configurar el embudo</summary>
          <p className="mt-sm text-sm text-muted">
            Las etapas con hito avanzan solas (primer contacto, cotización, reserva); ganado y perdido sólo se
            renombran.
          </p>
          <div className="mt-md flex flex-col gap-md">
            {board.columns.map((c) => (
              <LeadStageForm key={c.stage.id} stage={c.stage} />
            ))}
            <LeadStageForm />
          </div>
        </details>
      ) : null}
    </AppShell>
  );
}
