import {
  corporateCopy,
  type PresentedCard,
  type PresentedCell,
  type PresentedDrillLevel,
  type PresentedTrend,
} from "@meguiars/domain";
import Link from "next/link";

/**
 * Piezas del tablero corporativo (D3). Sólo dibujan lo que ya viene
 * presentado por @meguiars/domain (mismos textos, formatos, tendencias y
 * alertas que el móvil); no calculan nada.
 */

const TREND_TONE: Record<PresentedTrend["tone"], string> = {
  good: "success",
  bad: "danger",
  neutral: "neutral",
  none: "neutral",
};

export function TrendBadge({ trend }: { trend: PresentedTrend }) {
  return (
    <span className="mg-badge" data-tone={TREND_TONE[trend.tone]} title={trend.hint} data-testid="trend">
      {trend.text}
      <span className="sr-only"> · {trend.hint}</span>
    </span>
  );
}

export function AlertBadge({ alert }: { alert: PresentedCell["alert"] }) {
  if (!alert) return null;
  return (
    <span className="mg-badge" data-tone="danger" role="status" data-testid="alert">
      ⚠ {alert.text}
    </span>
  );
}

/** Tarjeta del resumen: cifra consolidada, tendencia y alertas. */
export function CorporateCardTile({ card }: { card: PresentedCard }) {
  const c = card.consolidated;
  return (
    <article
      className="mg-card flex flex-col gap-xs"
      data-testid={`card-${card.id}`}
      data-alert={c?.alert ? "true" : undefined}
      aria-label={card.name}
    >
      <p className="text-sm text-muted">{card.name}</p>
      {c ? (
        <>
          <p className="text-xxl font-bold leading-tight" data-testid="value">
            {c.value}
          </p>
          <div className="flex flex-wrap items-center gap-xs text-xs">
            <TrendBadge trend={c.trend} />
            <AlertBadge alert={c.alert} />
          </div>
          {card.alerts > (c.alert ? 1 : 0) ? (
            <p className="text-xs text-danger">{corporateCopy.alerts(card.alerts)}</p>
          ) : null}
          <p className="text-xs text-muted">{c.trend.hint}</p>
          <Link href={card.href} className="text-sm underline">
            {corporateCopy.viewDetail} →
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted">{card.message}</p>
      )}
      {card.notes.map((n) => (
        <p key={n} className="text-xs text-muted">
          {n}
        </p>
      ))}
    </article>
  );
}

function CellView({ cell }: { cell: PresentedCell | undefined }) {
  if (!cell) return <span className="text-muted">—</span>;
  return (
    <div className={`flex flex-col items-end gap-xxs ${cell.alert ? "text-danger" : ""}`}>
      <Link href={cell.href} className="font-medium underline">
        {cell.value}
      </Link>
      <TrendBadge trend={cell.trend} />
      {cell.alert ? (
        <span className="text-xs" title={cell.alert.text}>
          ⚠ {cell.alert.kind === "bajo" ? "bajo" : "alto"}
        </span>
      ) : null}
    </div>
  );
}

/** Comparativo: una fila por KPI, una columna por centro (1..N) y el consolidado. */
export function ComparisonTable({
  cards,
  centers,
}: {
  cards: readonly PresentedCard[];
  centers: readonly { id: string; name: string }[];
}) {
  return (
    <div className="relative min-w-0 overflow-x-auto" data-testid="comparison">
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">{corporateCopy.comparison}</caption>
        <thead className="bg-surface">
          <tr>
            <th scope="col" className="px-md py-sm text-left font-medium">
              {corporateCopy.kpi}
            </th>
            {centers.map((c) => (
              <th key={c.id} scope="col" className="px-md py-sm text-right font-medium">
                {c.name}
              </th>
            ))}
            <th scope="col" className="px-md py-sm text-right font-bold">
              {corporateCopy.consolidated}
            </th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.id} className="border-t border-border align-top" data-testid={`row-${card.id}`}>
              <th scope="row" className="px-md py-sm text-left font-medium">
                <Link href={card.href} className="underline">
                  {card.name}
                </Link>
              </th>
              {card.status === "ok" ? (
                <>
                  {centers.map((c) => (
                    <td key={c.id} className="px-md py-sm text-right">
                      <CellView cell={card.centers.find((x) => x.key === c.id)} />
                    </td>
                  ))}
                  <td className="px-md py-sm text-right">
                    <CellView cell={card.consolidated ?? undefined} />
                  </td>
                </>
              ) : (
                <td colSpan={centers.length + 1} className="px-md py-sm text-muted">
                  {card.message}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Nivel del drill-down: filas con barra, destino y conciliación contra la cifra. */
export function DrillLevelView({ level }: { level: PresentedDrillLevel }) {
  return (
    <section
      className="mg-card flex flex-col gap-sm"
      data-testid={`level-${level.kind}`}
      aria-label={level.title}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-lg font-bold text-accent">{level.title}</h2>
        <p className="text-sm">
          <span className="text-muted">{level.parentLabel}: </span>
          <span className="font-bold" data-testid="parent-value">
            {level.parentValue}
          </span>
        </p>
      </header>
      {level.rows.length === 0 ? (
        <p className="text-sm text-muted">
          {level.kind === "os" ? corporateCopy.orderLinesEmpty : corporateCopy.levelEmpty}
        </p>
      ) : null}
      <ul className="flex flex-col gap-sm">
        {level.rows.map((r) => (
          <li key={r.key} className={`flex flex-col gap-xxs text-sm ${r.level === 0 ? "font-bold" : ""}`}>
            <div className="flex justify-between gap-sm">
              <span>
                {r.target?.kind === "drill" ? (
                  <Link href={r.target.href} className="underline">
                    {r.label}
                  </Link>
                ) : r.target?.kind === "pnl" ? (
                  <Link href={r.target.target.href} className="underline">
                    {r.label}
                  </Link>
                ) : (
                  r.label
                )}
                {r.detail ? <span className="text-xs text-muted"> · {r.detail}</span> : null}
              </span>
              <span className="font-medium">
                {r.value}
                {r.share ? <span className="text-muted"> · {r.share}</span> : null}
              </span>
            </div>
            {level.kind !== "pnl" ? (
              <div className="h-xs rounded-full bg-surface-muted" aria-hidden="true">
                <div
                  className={`h-xs rounded-full ${r.raw < 0 ? "bg-danger" : "bg-brand"}`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {level.sum !== null ? (
        <p className="flex justify-between border-t border-border pt-xs text-sm">
          <span className="text-muted">{corporateCopy.sum}</span>
          <span className="font-bold" data-testid="sum">
            {level.sum}
          </span>
        </p>
      ) : null}
      {level.reconciliation ? (
        <p
          className="mg-tone rounded-md border p-sm text-xs"
          data-tone={level.reconciliation.ok ? "success" : "warning"}
          data-testid="reconciliation"
        >
          {level.reconciliation.text}
        </p>
      ) : null}
      {level.note ? <p className="text-xs text-muted">{level.note}</p> : null}
    </section>
  );
}
