import Link from "next/link";
import {
  formatKpiDelta,
  kpiDeltaTone,
  kpiTrend,
  TREND_SYMBOL,
  type BadgeContract,
  type CardContract,
  type EmptyStateContract,
  type KpiContract,
  type SkeletonContract,
  type TableContract,
} from "@meguiars/ui-tokens";

export function Card({
  title,
  subtitle,
  children,
  actions,
}: CardContract & { children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="mg-card">
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-sm">
          <div className="flex flex-col gap-xxs">
            {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({ label, tone = "neutral" }: BadgeContract) {
  return (
    <span className="mg-badge" data-tone={tone}>
      {label}
    </span>
  );
}

export function Skeleton({ lines = 3, label = "Cargando…" }: SkeletonContract) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-sm">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="mg-skeleton" style={{ width: `${100 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, message, action }: EmptyStateContract & { action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-sm rounded-lg border border-dashed border-border-strong p-xl text-center">
      <p className="text-lg font-semibold">{title}</p>
      {message ? <p className="max-w-(--mg-layout-narrow) text-sm text-muted">{message}</p> : null}
      {action}
    </div>
  );
}

export function KpiCard({ label, value, delta, higherIsBetter = true, caption }: KpiContract) {
  const trend = kpiTrend(delta);
  return (
    <div className="mg-card">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xxl font-bold leading-tight">{value}</p>
      {delta !== undefined ? (
        <p className="text-sm">
          <span className="mg-badge" data-tone={kpiDeltaTone(delta, higherIsBetter)}>
            <span aria-hidden="true">{TREND_SYMBOL[trend]}</span>&nbsp;{formatKpiDelta(delta)}
          </span>
        </p>
      ) : null}
      {caption ? <p className="text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

/** Primera columna como enlace al detalle de la fila (si hay `rowHref`). */
function cellContent<Row>(row: Row, index: number, text: string, rowHref?: (row: Row) => string) {
  return index === 0 && rowHref ? (
    <Link href={rowHref(row)} className="font-medium underline">
      {text}
    </Link>
  ) : (
    text
  );
}

/** Tabla en tablet/escritorio; lista de tarjetas en móvil. */
export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage,
  rowHref,
}: TableContract<Row> & { rowHref?: (row: Row) => string }) {
  if (rows.length === 0) return <EmptyState title={emptyMessage} />;
  return (
    <>
      <table className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-md py-sm font-medium ${c.align === "end" ? "text-right" : "text-left"}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border">
              {columns.map((c, i) => (
                <td key={c.key} className={`px-md py-sm ${c.align === "end" ? "text-right" : "text-left"}`}>
                  {cellContent(row, i, c.value(row), rowHref)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={caption} className="flex flex-col gap-sm md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="mg-card">
            <dl className="grid grid-cols-2 gap-xs text-sm">
              {columns.map((c, i) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted">{c.header}</dt>
                  <dd className={c.align === "end" ? "text-right" : ""}>
                    {cellContent(row, i, c.value(row), rowHref)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
