import { sectionCopy } from "@meguiars/domain";
import {
  createCashRepository,
  createDayRepository,
  createPaymentRepository,
  createPnlRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadFinanceSummary } from "@/lib/day";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Resumen financiero del centro activo: resultado del mes, cobrado hoy, por cobrar y caja. */
export default async function FinanceSummaryPage() {
  const state = await requireScreen("finanzas");
  const client = (await createSupabaseServerClient())!;
  const s = await loadFinanceSummary(state, {
    pnl: createPnlRepository(client),
    payments: createPaymentRepository(client),
    cash: createCashRepository(client),
    day: createDayRepository(client),
  });
  const copy = sectionCopy.finanzas;
  return (
    <AppShell
      state={state}
      screen="finanzas"
      title={copy.title}
      description={`${copy.description} · ${s.center.name}`}
    >
      {s.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {s.error}
        </p>
      ) : null}
      {s.kpis.length === 0 && !s.error ? (
        <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} />
      ) : null}
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="finance-kpis">
        {s.kpis.map((k) => (
          <Link
            key={k.key}
            href={k.href}
            className="block rounded-lg focus-visible:outline"
            aria-label={`${k.label}: ${k.value}`}
          >
            <KpiCard label={k.label} value={k.value} {...(k.caption ? { caption: k.caption } : {})} />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
