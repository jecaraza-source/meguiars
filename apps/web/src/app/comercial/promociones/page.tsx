import {
  activeCenterAccess,
  canInCenter,
  formatMoney,
  MARKETING_COPY,
  PROMOTION_STATE_LABELS,
  promotionState,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createCatalogRepository, createMarketingRepository } from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { PromotionForm } from "@/components/marketing-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Promociones con código: vigencia, usos y descuento otorgado. Crearlas es del admin. */
export default async function PromotionsPage() {
  const state = await requireScreen("promotions");
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const supabase = (await createSupabaseServerClient())!;
  const repo = createMarketingRepository(supabase);
  const canCreate = canInCenter(state, center.id, "promotions.manage");
  const [promos, campaigns, catalog] = await Promise.all([
    repo.promotions(center.organizationId),
    canCreate ? repo.campaigns(center.organizationId) : Promise.resolve(null),
    canCreate ? createCatalogRepository(supabase).listForCenter(center.id) : Promise.resolve(null),
  ]);
  const centers = usableCenters(state.access)
    .filter((a) => a.center.organizationId === center.organizationId)
    .map((a) => ({ value: a.center.id, label: a.center.name }));
  const centerName = Object.fromEntries(centers.map((c) => [c.value, c.label]));

  return (
    <AppShell
      state={state}
      screen="promotions"
      title={MARKETING_COPY.promotionsTitle}
      description={center.name}
    >
      <p className="text-sm text-muted">{MARKETING_COPY.promotionNote}</p>
      {!promos.ok ? (
        <EmptyState title={promos.error.message} />
      ) : promos.data.length === 0 ? (
        <EmptyState title={MARKETING_COPY.noPromotions} />
      ) : (
        <div className="grid gap-md md:grid-cols-2" data-testid="promotion-list">
          {promos.data.map((p) => {
            const st = promotionState(p, today);
            return (
              <Card
                key={p.id}
                title={p.code}
                actions={
                  <Badge label={PROMOTION_STATE_LABELS[st]} tone={st === "vigente" ? "success" : "neutral"} />
                }
              >
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-sm">
                  {p.kind === "percent" ? `${p.value} %` : formatMoney(p.value)} ·{" "}
                  {p.serviceNames.length ? p.serviceNames.join(", ") : "toda la cotización u OS"} ·{" "}
                  {p.detailCenterIds.length
                    ? p.detailCenterIds.map((id) => centerName[id] ?? "otro centro").join(", ")
                    : "todos los centros"}
                </p>
                <p className="text-sm text-muted">
                  {p.startsOn} – {p.endsOn} · {p.uses}
                  {p.maxUses ? ` de ${p.maxUses}` : ""} usos · descuento otorgado{" "}
                  {formatMoney(p.discountGranted)}
                  {p.campaignName ? ` · ${p.campaignName}` : ""}
                </p>
                {p.terms ? <p className="text-xs text-muted">{p.terms}</p> : null}
              </Card>
            );
          })}
        </div>
      )}
      {canCreate ? (
        <Card title={MARKETING_COPY.newPromotion}>
          <PromotionForm
            campaigns={(campaigns?.ok ? campaigns.data : []).map((c) => ({ value: c.id, label: c.name }))}
            services={(catalog?.ok ? catalog.data : []).map((s) => ({ value: s.id, label: s.name }))}
            centers={centers}
            today={today}
          />
        </Card>
      ) : null}
    </AppShell>
  );
}
