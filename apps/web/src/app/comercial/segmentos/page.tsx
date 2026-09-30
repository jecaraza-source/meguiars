import {
  activeCenterAccess,
  COMMERCIAL_COPY,
  commercialErrorMessage,
  formatDateOnly,
  formatMoney,
  LEAD_CONSENT_CHANNELS,
  LEAD_CONSENT_LABELS,
} from "@meguiars/domain";
import { createCatalogRepository, createCommercialRepository } from "@meguiars/supabase";
import { segmentFilterSchema } from "@meguiars/validation";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PRESETS = [
  { label: "Inactivos 90+ días con consentimiento", href: "?minDaysSinceVisit=90&consentChannel=whatsapp" },
  { label: "Alto gasto (≥ $5,000)", href: "?minSpend=5000" },
  { label: "Recurrentes (3+ visitas)", href: "?minVisits=3" },
  { label: "Visitaron en los últimos 30 días", href: "?maxDaysSinceVisit=30" },
];

/** Segmentación de clientes del centro activo (filtros por URL, para compartir y repetir). */
export default async function SegmentsPage({ searchParams }: PageProps<"/comercial/segmentos">) {
  const state = await requireScreen("segments");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const list = (k: string) => (Array.isArray(params[k]) ? params[k] : params[k] ? [params[k] as string] : []);
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const parsed = segmentFilterSchema.safeParse({
    serviceIds: list("serviceIds"),
    interestServiceIds: list("interestServiceIds"),
    minVisits: one("minVisits"),
    minSpend: one("minSpend"),
    maxSpend: one("maxSpend"),
    minDaysSinceVisit: one("minDaysSinceVisit"),
    maxDaysSinceVisit: one("maxDaysSinceVisit"),
    consentChannel: one("consentChannel"),
  });
  const supabase = (await createSupabaseServerClient())!;
  const [catalog, result] = await Promise.all([
    createCatalogRepository(supabase).listForCenter(center.id, { includeInactive: true }),
    parsed.success
      ? createCommercialRepository(supabase).segment([center.id], parsed.data)
      : Promise.resolve(null),
  ]);
  const services = catalog.ok ? catalog.data : [];
  const selected = (k: string) => new Set(list(k));
  return (
    <AppShell state={state} screen="segments" title={COMMERCIAL_COPY.segmentsTitle} description={center.name}>
      <p className="text-sm text-muted">{COMMERCIAL_COPY.segmentsHint}</p>
      <div className="flex flex-wrap gap-xs">
        {PRESETS.map((p) => (
          <a key={p.label} href={p.href} className="mg-badge" data-tone="neutral">
            {p.label}
          </a>
        ))}
      </div>
      <Card title="Filtros">
        <form className="flex flex-col gap-md" action="/comercial/segmentos">
          <div className="grid gap-md md:grid-cols-4">
            {(
              [
                ["minVisits", "Visitas mínimas"],
                ["minSpend", "Gasto mínimo"],
                ["maxSpend", "Gasto máximo"],
                ["minDaysSinceVisit", "Días sin visita (mínimo)"],
                ["maxDaysSinceVisit", "Días sin visita (máximo)"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex flex-col gap-xs text-sm">
                {label}
                <input name={k} inputMode="numeric" defaultValue={one(k)} className="mg-input" />
              </label>
            ))}
            <label className="flex flex-col gap-xs text-sm">
              Consentimiento por
              <select name="consentChannel" defaultValue={one("consentChannel")} className="mg-input">
                <option value="">Cualquiera</option>
                {LEAD_CONSENT_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {LEAD_CONSENT_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="flex flex-col gap-xs">
            <legend className="mg-label">Contrató alguno de</legend>
            <div className="grid gap-xs md:grid-cols-3">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-xs text-sm">
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={s.id}
                    defaultChecked={selected("serviceIds").has(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-xs">
            <legend className="mg-label">Mostró interés en (prospecto o cotización abierta)</legend>
            <div className="grid gap-xs md:grid-cols-3">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-xs text-sm">
                  <input
                    type="checkbox"
                    name="interestServiceIds"
                    value={s.id}
                    defaultChecked={selected("interestServiceIds").has(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <button type="submit" className="mg-btn" data-variant="primary">
              Aplicar
            </button>
          </div>
        </form>
      </Card>
      {!parsed.success ? (
        <EmptyState
          title="Filtros inválidos"
          message={parsed.error.issues.map((i) => i.message).join("; ")}
        />
      ) : result && !result.ok ? (
        <EmptyState title="No se pudo calcular el segmento" message={commercialErrorMessage(result.error)} />
      ) : (
        <Card title={`${result?.ok ? result.data.length : 0} clientes`}>
          <Table
            caption="Segmento"
            rows={result?.ok ? result.data : []}
            rowKey={(r) => r.clientId}
            rowHref={(r) => `/comercial/clientes/${r.clientId}`}
            emptyMessage="Ningún cliente cumple los filtros."
            columns={[
              { key: "name", header: "Cliente", value: (r) => r.fullName },
              { key: "visits", header: "Visitas", align: "end", value: (r) => String(r.visits) },
              {
                key: "spend",
                header: "Gasto acumulado",
                align: "end",
                value: (r) => formatMoney(r.totalSpend),
              },
              {
                key: "ticket",
                header: "Ticket",
                align: "end",
                value: (r) => (r.avgTicket == null ? "—" : formatMoney(r.avgTicket)),
              },
              {
                key: "last",
                header: "Última visita",
                value: (r) =>
                  r.lastVisitAt
                    ? `${formatDateOnly(r.lastVisitAt.slice(0, 10))} (${r.daysSinceLastVisit} d)`
                    : "Sin visitas",
              },
              {
                key: "freq",
                header: "Cada",
                value: (r) =>
                  r.avgDaysBetweenVisits == null ? "—" : `${Math.round(r.avgDaysBetweenVisits)} días`,
              },
              { key: "services", header: "Servicios", value: (r) => r.serviceNames.join(", ") || "—" },
              {
                key: "consent",
                header: "Promociones",
                value: (r) => r.consentChannels.join(", ") || "Sin consentimiento",
              },
            ]}
          />
          <p className="mt-sm text-xs text-muted">
            Gasto = suma de OS entregadas (incluye las de duplicados fusionados). Frecuencia = días promedio
            entre visitas.
          </p>
        </Card>
      )}
    </AppShell>
  );
}
