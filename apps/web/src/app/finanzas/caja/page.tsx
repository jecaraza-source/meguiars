import {
  activeCenterAccess,
  can,
  canInActiveCenter,
  CASH_RANGE_LABELS,
  CASH_RANGES,
  cashCopy,
  cashErrorMessage,
  cashRange,
  formatDateOnly,
  formatMoney,
  newRequestId,
  presentCashRow,
  todayIn,
  usableCenters,
  type CashRangeKey,
} from "@meguiars/domain";
import { createCashRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OpenCashForm } from "@/components/cash-forms";
import { Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cortes de caja por centro y turno: caja abierta, apertura, listado y efectivo fuera de corte. */
export default async function CashPage({ searchParams }: PageProps<"/finanzas/caja">) {
  const state = await requireScreen("cash");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const all = params.alcance === "todos";
  const key: CashRangeKey = CASH_RANGES.includes(params.rango as CashRangeKey)
    ? (params.rango as CashRangeKey)
    : "7";
  const centers = all
    ? usableCenters(state.access)
        .filter((a) => can([...a.roles, ...a.corporateRoles], "cash.read"))
        .map((a) => a.center.id)
    : [center.id];
  const names = new Map(usableCenters(state.access).map((a) => [a.center.id, a.center.name]));
  const today = todayIn(center.timezone);
  const { from, to } = cashRange(key, today);
  const repo = createCashRepository((await createSupabaseServerClient())!);
  const [sessions, uncovered, current] = await Promise.all([
    repo.list(centers, from, to),
    repo.uncovered(centers, from, to),
    // Caja abierta del centro activo (puede venir de un día anterior).
    repo.list([center.id], "2000-01-01", today),
  ]);
  const open = current.ok ? current.data.find((s) => s.status === "abierta") : undefined;
  const lastFloat = current.ok ? (current.data[0]?.openingFloat ?? 0) : 0;
  const canOperate = canInActiveCenter(state, "cash.operate");
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { alcance: all ? "todos" : undefined, rango: key === "7" ? undefined : key, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/finanzas/caja?${s}` : "/finanzas/caja";
  };

  return (
    <AppShell state={state} screen="cash" title={cashCopy.title} description={cashCopy.description}>
      <Card title={`${cashCopy.openNow} · ${center.name}`}>
        {!current.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {cashErrorMessage(current.error)}
          </p>
        ) : open ? (
          <div className="flex flex-wrap items-center justify-between gap-md" data-testid="cash-current">
            <p className="text-sm">
              <Link href={`/finanzas/caja/${open.id}`} className="font-medium underline">
                {presentCashRow(open).folio}
              </Link>{" "}
              · {presentCashRow(open).shift} · {cashCopy.expected}:{" "}
              <strong>{formatMoney(open.expectedCash)}</strong>
            </p>
            {canOperate ? (
              <Link href={`/finanzas/caja/${open.id}`} className="text-sm underline">
                {cashCopy.close} →
              </Link>
            ) : null}
          </div>
        ) : canOperate ? (
          <OpenCashForm requestId={newRequestId()} defaultFloat={lastFloat} />
        ) : (
          <EmptyState title={cashCopy.noOpen} />
        )}
      </Card>

      {uncovered.ok && uncovered.data.length > 0 ? (
        <Card title={cashCopy.uncovered} subtitle={cashCopy.uncoveredHint}>
          <ul className="flex flex-col gap-xs text-sm" data-testid="cash-uncovered">
            {uncovered.data.map((u) => (
              <li
                key={`${u.detailCenterId}-${u.day}`}
                className="mg-tone rounded-md border p-sm"
                data-tone="warning"
              >
                {names.get(u.detailCenterId) ?? ""} · {formatDateOnly(u.day)} · {formatMoney(u.cashAmount)} (
                {u.paymentsCount} {cashCopy.payments.toLowerCase()})
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title={cashCopy.title}
        subtitle={`${CASH_RANGE_LABELS[key]} · ${all ? cashCopy.scopeAll : center.name}`}
        actions={
          <nav className="flex flex-wrap gap-md text-sm" aria-label="Periodo">
            {CASH_RANGES.map((r) =>
              r === key ? (
                <strong key={r}>{CASH_RANGE_LABELS[r]}</strong>
              ) : (
                <Link key={r} href={link({ rango: r === "7" ? undefined : r })} className="underline">
                  {CASH_RANGE_LABELS[r]}
                </Link>
              ),
            )}
            <Link href={link({ alcance: all ? undefined : "todos" })} className="underline">
              {all ? cashCopy.scopeCenter : cashCopy.scopeAll}
            </Link>
          </nav>
        }
      >
        {!sessions.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {cashErrorMessage(sessions.error)}
          </p>
        ) : (
          <Table
            caption={cashCopy.title}
            rows={sessions.data.map((s) => ({
              ...presentCashRow(s),
              center: names.get(s.detailCenterId) ?? "",
            }))}
            rowKey={(r) => r.id}
            rowHref={(r) => `/finanzas/caja/${r.id}`}
            emptyMessage={cashCopy.empty}
            columns={[
              { key: "folio", header: cashCopy.folio, value: (r) => r.folio },
              ...(all
                ? [{ key: "center", header: "Centro", value: (r: { center: string }) => r.center }]
                : []),
              { key: "day", header: cashCopy.day, value: (r) => r.day },
              { key: "shift", header: cashCopy.shift, value: (r) => r.shift },
              { key: "status", header: cashCopy.status, value: (r) => r.status },
              { key: "expected", header: cashCopy.expected, value: (r) => r.expected, align: "end" },
              { key: "counted", header: cashCopy.counted, value: (r) => r.counted, align: "end" },
              { key: "difference", header: cashCopy.difference, value: (r) => r.difference, align: "end" },
              { key: "card", header: cashCopy.card, value: (r) => r.card, align: "end" },
              { key: "transfer", header: cashCopy.transfer, value: (r) => r.transfer, align: "end" },
              { key: "versions", header: cashCopy.history, value: (r) => r.versions ?? "—" },
            ]}
          />
        )}
      </Card>
    </AppShell>
  );
}
