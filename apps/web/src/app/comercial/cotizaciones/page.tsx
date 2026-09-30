import {
  activeCenterAccess,
  COMMERCIAL_COPY,
  commercialErrorMessage,
  formatDateOnly,
  formatMoney,
  presentQuote,
  QUOTE_STATUS_LABELS,
  type QuoteDisplayStatus,
} from "@meguiars/domain";
import { createCommercialRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FILTERS: QuoteDisplayStatus[] = [
  "borrador",
  "enviada",
  "aceptada",
  "convertida",
  "vencida",
  "rechazada",
  "cancelada",
];

/** Cotizaciones del centro activo, por estado. Se crean desde un prospecto o desde la ficha del cliente. */
export default async function QuotesPage({ searchParams }: PageProps<"/comercial/cotizaciones">) {
  const state = await requireScreen("quotes");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const status = FILTERS.find((s) => s === params.estado);
  const repo = createCommercialRepository((await createSupabaseServerClient())!);
  const result = await repo.quotes([center.id], { status });
  const rows = result.ok ? result.data.map(presentQuote) : [];
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
    <AppShell state={state} screen="quotes" title={COMMERCIAL_COPY.quotesTitle} description={center.name}>
      <p className="text-sm text-muted">
        Crea una cotización desde un prospecto o desde la ficha del cliente (Clientes (CRM)).
      </p>
      <div className="flex flex-wrap gap-xs" aria-label="Estado">
        {chip(!status, "Todas", "/comercial/cotizaciones")}
        {FILTERS.map((s) =>
          chip(status === s, QUOTE_STATUS_LABELS[s], `/comercial/cotizaciones?estado=${s}`),
        )}
      </div>
      {!result.ok ? (
        <EmptyState
          title="No se pudieron cargar las cotizaciones"
          message={commercialErrorMessage(result.error)}
        />
      ) : (
        <>
          <Table
            caption={COMMERCIAL_COPY.quotesTitle}
            rows={rows}
            rowKey={(q) => q.id}
            rowHref={(q) => `/comercial/cotizaciones/${q.id}`}
            emptyMessage={COMMERCIAL_COPY.quotesEmpty}
            columns={[
              { key: "folio", header: "Folio", value: (q) => q.folio },
              { key: "who", header: "Para", value: (q) => q.who },
              { key: "status", header: "Estado", value: (q) => q.statusLabel },
              { key: "valid", header: "Vigente hasta", value: (q) => formatDateOnly(q.validUntil) },
              { key: "total", header: "Total", align: "end", value: (q) => formatMoney(q.total) },
              { key: "margin", header: "Margen de contribución", align: "end", value: (q) => q.marginLabel },
            ]}
          />
          <p className="text-xs text-muted">{COMMERCIAL_COPY.marginNote}</p>
        </>
      )}
    </AppShell>
  );
}
