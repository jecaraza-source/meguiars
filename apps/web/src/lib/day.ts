import "server-only";
import { pnlByCenter } from "@meguiars/analytics";
import {
  activeCenterAccess,
  canInActiveCenter,
  formatMoney,
  formatPercent,
  guardScreen,
  pnlErrorMessage,
  presentDaySummary,
  todayIn,
  type CashRepository,
  type DayRepository,
  type PaymentRepository,
  type PnlRepository,
  type SignedInState,
} from "@meguiars/domain";

/** Operación del día: resumen del centro activo (una lectura) y accesos rápidos. */
export async function loadDayView(state: SignedInState, repo: DayRepository) {
  const center = activeCenterAccess(state)!.center;
  const r = await repo.summary(center.id);
  return {
    center,
    error: r.ok ? null : pnlErrorMessage(r.error),
    view: r.ok ? presentDaySummary(r.data, center.timezone) : null,
    canNewOrder: guardScreen(state, "orderNew").allow,
    canNewAppointment: guardScreen(state, "appointmentNew").allow,
  };
}

/**
 * Resumen financiero del centro activo: resultado del mes a la fecha (misma
 * fórmula que el estado de resultados), cobrado hoy, por cobrar y caja.
 * Cada bloque sólo si el usuario tiene su permiso.
 */
export async function loadFinanceSummary(
  state: SignedInState,
  repos: { pnl: PnlRepository; payments: PaymentRepository; cash: CashRepository; day: DayRepository },
) {
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const monthFrom = `${today.slice(0, 8)}01`;
  const canPnl = canInActiveCenter(state, "pnl.read");
  const canPay = canInActiveCenter(state, "payments.read");
  const canCash = canInActiveCenter(state, "cash.read");
  const [lines, day, receivables, cash] = await Promise.all([
    canPnl ? repos.pnl.lines([center.id], monthFrom, today) : null,
    canPay ? repos.day.summary(center.id) : null,
    canPay ? repos.payments.receivables([center.id]) : null,
    canCash ? repos.cash.list([center.id], today, today) : null,
  ]);
  const kpis: { key: string; label: string; value: string; caption?: string; href: string }[] = [];
  const errors: string[] = [];
  if (lines) {
    if (!lines.ok) errors.push(pnlErrorMessage(lines.error));
    else {
      const s = pnlByCenter(lines.data, [center.id]).consolidated;
      kpis.push(
        {
          key: "ventas",
          label: "Ventas del mes",
          value: formatMoney(s.revenue),
          caption: `Del ${monthFrom} a hoy`,
          href: "/finanzas/resultados",
        },
        {
          key: "utilidad",
          label: "Utilidad bruta del mes",
          value: formatMoney(s.grossProfit),
          caption: `Margen ${formatPercent(s.grossMargin)}`,
          href: "/finanzas/resultados",
        },
        {
          key: "ebitda",
          label: "EBITDA del mes",
          value: formatMoney(s.ebitda),
          caption: `Egresos ${formatMoney(s.personnel + s.operatingExpenses)}`,
          href: "/finanzas/resultados",
        },
      );
    }
  }
  if (day?.ok && day.data.payments)
    kpis.push({
      key: "cobrado",
      label: "Cobrado hoy",
      value: formatMoney(day.data.payments.total),
      caption: `${day.data.payments.count} ${day.data.payments.count === 1 ? "recibo" : "recibos"}`,
      href: "/finanzas/cobranza",
    });
  if (receivables?.ok) {
    const pending = receivables.data.filter((o) => o.balance > 0);
    kpis.push({
      key: "por_cobrar",
      label: "Por cobrar",
      value: formatMoney(pending.reduce((a, o) => a + o.balance, 0)),
      caption: `${pending.length} ${pending.length === 1 ? "orden" : "órdenes"}`,
      href: "/finanzas/cobranza",
    });
  }
  if (cash?.ok) {
    const open = cash.data.find((c) => c.status !== "cerrada");
    kpis.push({
      key: "caja",
      label: "Caja de hoy",
      value: open ? formatMoney(open.expectedCash) : "Sin caja abierta",
      caption: open ? `Abierta · efectivo esperado (${open.folio})` : "Abre la caja en Corte de caja",
      href: "/finanzas/caja",
    });
  }
  return { center, today, kpis, error: errors[0] ?? null };
}
