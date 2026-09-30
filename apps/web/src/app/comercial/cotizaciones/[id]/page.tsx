import {
  canInCenter,
  COMMERCIAL_COPY,
  commercialErrorMessage,
  formatDateOnly,
  formatInCenterTimeZone,
  formatMoney,
  newRequestId,
  presentQuote,
  quoteShareText,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createCatalogRepository,
  createClientRepository,
  createCommercialRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  AddServiceToQuoteForm,
  BookQuoteForm,
  QuoteDiscountForm,
  QuoteItemForm,
  QuoteStatusForm,
  ShareQuoteText,
  UpdateQuoteForm,
  VoidQuoteDiscountForm,
} from "@/components/commercial-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cotización: líneas con costo del operador y margen, descuentos autorizados, estado, compartir y reservar. */
export default async function QuotePage({ params, searchParams }: PageProps<"/comercial/cotizaciones/[id]">) {
  const state = await requireScreen("quoteDetail");
  const { id } = await params;
  const query = await searchParams;
  const supabase = (await createSupabaseServerClient())!;
  const repo = createCommercialRepository(supabase);
  const centers = usableCenters(state.access).map((a) => a.center);
  const result = await repo.quote(
    id,
    centers.map((c) => c.id),
  );
  if (!result.ok) {
    return (
      <AppShell state={state} screen="quoteDetail" title={COMMERCIAL_COPY.quotesTitle}>
        <Link href="/comercial/cotizaciones" className="text-sm underline">
          ← {COMMERCIAL_COPY.quotesTitle}
        </Link>
        <EmptyState title="Cotización no encontrada" message={commercialErrorMessage(result.error)} />
      </AppShell>
    );
  }
  const q = presentQuote(result.data);
  const center = centers.find((c) => c.id === q.detailCenterId)!;
  const agenda = createAgendaRepository(supabase);
  const [client, catalog, bays, technicians] = await Promise.all([
    q.clientId ? createClientRepository(supabase).get(q.clientId) : Promise.resolve(null),
    q.editable ? createCatalogRepository(supabase).listForCenter(q.detailCenterId) : Promise.resolve(null),
    q.bookingBlocker ? Promise.resolve(null) : agenda.listBays(q.detailCenterId),
    q.bookingBlocker ? Promise.resolve(null) : agenda.listTechnicians(q.detailCenterId),
  ]);
  const canWrite = canInCenter(state, q.detailCenterId, "leads.use");
  const vehicles = (client?.ok ? client.data.vehicles : [])
    .filter((v) => v.active)
    .map((v) => ({ value: v.id, label: `${v.make} ${v.model} ${v.year} · ${v.plate}` }));
  const missing = (catalog?.ok ? catalog.data : [])
    .filter((c) => !q.items.some((i) => i.serviceId === c.id))
    .map((c) => ({ value: c.id, label: `${c.name} · ${formatMoney(c.price)}` }));
  const activeDiscounts = q.discounts.filter((d) => !d.voidedAt);

  return (
    <AppShell
      state={state}
      screen="quoteDetail"
      title={`Cotización ${q.folio}`}
      description={`${q.who} · ${center.name}`}
    >
      <Link
        href={q.leadId ? `/comercial/prospectos/${q.leadId}` : "/comercial/cotizaciones"}
        className="text-sm underline"
      >
        ← {q.leadId ? "Prospecto" : COMMERCIAL_COPY.quotesTitle}
      </Link>
      {query.nueva === "1" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          Cotización creada. Compártela con el cliente y márcala como enviada.
        </p>
      ) : null}
      {query.reservada === "1" ? (
        <p
          role="status"
          className="mg-tone rounded-md border p-md text-sm"
          data-tone="success"
          data-testid="quote-booked"
        >
          Reserva creada en la agenda.
        </p>
      ) : null}

      <Card
        title={q.folio}
        subtitle={`${q.who}${q.vehicleLabel ? ` · ${q.vehicleLabel}` : ""} · vigente hasta ${formatDateOnly(q.validUntil)}`}
        actions={<Badge label={q.statusLabel} tone={q.statusTone} />}
      >
        <table className="w-full text-sm" data-testid="quote-lines">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-xs">Servicio</th>
              <th className="py-xs text-right">Cant.</th>
              <th className="py-xs text-right">Precio</th>
              <th className="py-xs text-right">Descuento</th>
              <th className="py-xs text-right">Pago al operador</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((i) => (
              <tr key={i.id} className="border-t border-border align-top">
                <td className="py-xs">
                  {i.serviceName}
                  {i.operatorCommissionPct != null ? (
                    <span className="block text-xs text-muted">
                      Operador {i.operatorCommissionPct} % × (precio − descuento de la línea)
                    </span>
                  ) : null}
                </td>
                <td className="py-xs text-right">
                  {canWrite && q.editable ? (
                    <QuoteItemForm quote={q} serviceId={i.serviceId} quantity={i.quantity} />
                  ) : (
                    i.quantity
                  )}
                </td>
                <td className="py-xs text-right">{formatMoney(i.lineSubtotal)}</td>
                <td className="py-xs text-right">
                  {i.lineDiscount ? `−${formatMoney(i.lineDiscount)}` : "—"}
                </td>
                <td className="py-xs text-right">{formatMoney(i.operatorPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-md grid gap-sm text-sm md:grid-cols-5" data-testid="quote-totals">
          <div>
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatMoney(q.subtotal)}</dd>
          </div>
          <div>
            <dt className="text-muted">Descuentos</dt>
            <dd>{q.discountTotal ? `−${formatMoney(q.discountTotal)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Total (IVA incluido)</dt>
            <dd className="font-medium">{formatMoney(q.total)}</dd>
          </div>
          <div>
            <dt className="text-muted">Costo directo estimado</dt>
            <dd>
              {formatMoney(q.costTotal)}
              <span className="block text-xs text-muted">
                otros {formatMoney(q.standardCostTotal)} + operador {formatMoney(q.operatorPayTotal)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Margen de contribución</dt>
            <dd className="font-medium">{q.marginLabel}</dd>
          </div>
        </dl>
        <p className="mt-sm text-xs text-muted">{COMMERCIAL_COPY.marginNote}</p>
        {q.drift.length > 0 && q.status !== "convertida" ? (
          <p className="mg-tone mt-md rounded-md border p-sm text-sm" data-tone="warning">
            {COMMERCIAL_COPY.priceDrift}{" "}
            {q.drift
              .map(
                (i) =>
                  `${i.serviceName} (cotizado ${formatMoney(i.unitPrice)}, hoy ${formatMoney(i.currentPrice ?? 0)})`,
              )
              .join("; ")}
            . Se respeta el precio cotizado mientras esté vigente.
          </p>
        ) : null}
        {q.appointmentId ? (
          <p className="mt-md text-sm" data-testid="quote-appointment">
            Reservada:{" "}
            <Link href={`/agenda/${q.appointmentId}`} className="underline">
              {q.appointmentStartsAt
                ? formatInCenterTimeZone(q.appointmentStartsAt, center.timezone)
                : "ver cita"}
            </Link>
            {q.serviceOrderFolio ? (
              <>
                {" "}
                · OS{" "}
                <Link href={`/ordenes/${q.serviceOrderId}`} className="underline">
                  {q.serviceOrderFolio}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {q.decisionReason ? <p className="mt-sm text-sm">Motivo: {q.decisionReason}</p> : null}
      </Card>

      {q.discounts.length > 0 ? (
        <Card title="Descuentos">
          <ul className="flex flex-col gap-sm text-sm">
            {q.discounts.map((d) => (
              <li key={d.id} className="flex flex-col gap-xs border-b border-border pb-sm">
                <span className={d.voidedAt ? "text-muted line-through" : ""}>
                  {d.kind === "percent" ? `${d.value} %` : formatMoney(d.value)} ({formatMoney(d.amount)}) ·{" "}
                  {d.itemId
                    ? (q.items.find((i) => i.id === d.itemId)?.serviceName ?? "línea")
                    : "toda la cotización"}{" "}
                  · {d.reason}
                </span>
                <span className="text-xs text-muted">
                  Autorizó {d.authorizedByName ?? "—"} (nivel {d.authorizationLevel})
                  {d.voidedAt ? ` · anulado: ${d.voidReason}` : ""}
                </span>
                {canWrite && q.editable && !d.voidedAt ? (
                  <VoidQuoteDiscountForm quote={q} discountId={d.id} />
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-sm text-xs text-muted">
            Descuento activo: {activeDiscounts.length}. El nivel se exige por el % acumulado, igual que en la
            OS.
          </p>
        </Card>
      ) : null}

      {canWrite && q.editable ? (
        <Card title="Editar">
          <div className="flex flex-col gap-md">
            <AddServiceToQuoteForm quote={q} options={missing} />
            <QuoteDiscountForm quote={q} />
            <UpdateQuoteForm quote={q} vehicles={vehicles} />
          </div>
        </Card>
      ) : null}

      <Card title="Compartir">
        <p className="mb-sm text-sm text-muted">{COMMERCIAL_COPY.noSocialSend}</p>
        <ShareQuoteText text={quoteShareText(q, center.name)} />
        {canWrite && q.statusActions.length > 0 ? (
          <div className="mt-md flex flex-wrap items-end gap-md" data-testid="quote-status-actions">
            {q.statusActions.map((s) =>
              s === "borrador" || s === "convertida" ? null : (
                <QuoteStatusForm key={s} quote={q} status={s} />
              ),
            )}
          </div>
        ) : null}
      </Card>

      {canWrite ? (
        <Card title={COMMERCIAL_COPY.book}>
          {q.bookingBlocker ? (
            <div className="flex flex-col gap-sm text-sm">
              <p>{q.bookingBlocker}</p>
              {!q.clientId && q.leadId ? (
                <div>
                  <ButtonLink
                    href={`/comercial/prospectos/${q.leadId}`}
                    label="Ir al prospecto"
                    variant="secondary"
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <BookQuoteForm
              quote={q}
              requestId={newRequestId()}
              vehicles={vehicles}
              bays={(bays?.ok ? bays.data : [])
                .filter((b) => b.active)
                .map((b) => ({ value: b.id, label: b.name }))}
              technicians={(technicians?.ok ? technicians.data : [])
                .filter((t) => t.active)
                .map((t) => ({ value: t.id, label: t.fullName }))}
              today={todayIn(center.timezone)}
            />
          )}
        </Card>
      ) : null}
    </AppShell>
  );
}
