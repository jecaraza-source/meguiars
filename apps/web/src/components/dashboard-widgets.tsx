import { dashboardsCopy, type PresentedWidget } from "@meguiars/domain";
import Link from "next/link";

/** Clases estáticas (Tailwind no ve clases armadas en tiempo de ejecución). */
const COL_SPAN: Record<number, string> = {
  1: "",
  2: "md:col-span-2",
  3: "md:col-span-2 lg:col-span-3",
  4: "md:col-span-2 lg:col-span-4",
};
const ROW_SPAN: Record<number, string> = { 1: "", 2: "lg:row-span-2" };

export const widgetSpanClass = (colSpan: number, rowSpan: number) =>
  [COL_SPAN[colSpan] ?? "", ROW_SPAN[rowSpan] ?? ""].filter(Boolean).join(" ");

function Bars({ rows, caption }: { rows: PresentedWidget["rows"]; caption: string }) {
  return (
    <ul aria-label={caption} className="flex flex-col gap-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-xxs text-sm">
          <div className="flex justify-between gap-sm">
            <span>{r.label}</span>
            <span className="font-medium">
              {r.value}
              {r.share ? <span className="text-muted"> · {r.share}</span> : null}
            </span>
          </div>
          <div className="h-xs rounded-full bg-surface-muted" aria-hidden="true">
            <div className="h-xs rounded-full bg-brand" style={{ width: `${r.pct}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Alto de la serie a partir de los tokens de espaciado (sin tamaños escritos a mano). */
const CHART_HEIGHT = "calc(var(--mg-space-xxxl) * 3)";

/** Serie: columnas proporcionales (sin librería de gráficas) + lista accesible. */
function Series({ rows, caption }: { rows: PresentedWidget["rows"]; caption: string }) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  return (
    <figure className="flex flex-col gap-xs">
      <div className="flex items-end gap-xxs" style={{ height: CHART_HEIGHT }} aria-hidden="true">
        {rows.map((r) => (
          <div
            key={r.key}
            title={`${r.label}: ${r.value}`}
            className="flex-1 rounded-sm bg-brand"
            style={{ height: `${Math.max(r.pct, r.raw === 0 ? 0 : 2)}%` }}
          />
        ))}
      </div>
      <figcaption className="flex justify-between text-xs text-muted">
        <span>{first?.label}</span>
        <span>{last?.label}</span>
      </figcaption>
      <ul aria-label={caption} className="sr-only">
        {rows.map((r) => (
          <li key={r.key}>
            {r.label}: {r.value}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Ranking({ rows, caption }: { rows: PresentedWidget["rows"]; caption: string }) {
  return (
    <ol aria-label={caption} className="flex flex-col gap-xs text-sm">
      {rows.map((r, i) => (
        <li key={r.key} className="flex justify-between gap-sm border-b border-border pb-xs">
          <span>
            <span className="text-muted">{i + 1}.</span> {r.label}
          </span>
          <span className="font-medium">
            {r.value}
            {r.share ? <span className="text-muted"> · {r.share}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DashboardWidgetCard({ widget }: { widget: PresentedWidget }) {
  const w = widget;
  return (
    <section
      className={`mg-card flex flex-col gap-sm ${widgetSpanClass(w.colSpan, w.rowSpan)}`}
      data-testid={`widget-${w.id}`}
      aria-label={w.title}
    >
      <header className="flex flex-col gap-xxs">
        <h3 className="text-sm text-muted">{w.title}</h3>
        {w.subtitle ? <p className="text-xs text-muted">{w.subtitle}</p> : null}
      </header>
      {w.value !== null ? <p className="text-xxl font-bold leading-tight">{w.value}</p> : null}
      {w.message ? <p className="text-sm text-muted">{w.message}</p> : null}
      {!w.message && w.rows.length > 0 ? (
        w.type === "timeseries" ? (
          <Series rows={w.rows} caption={w.title} />
        ) : w.type === "ranking" ? (
          <Ranking rows={w.rows} caption={w.title} />
        ) : (
          <Bars rows={w.rows} caption={w.title} />
        )
      ) : null}
      {w.notes.map((n) => (
        <p key={n} className="mg-tone rounded-md border px-sm py-xxs text-xs" data-tone="warning">
          {n}
        </p>
      ))}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-sm">
        {w.formula ? (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">{dashboardsCopy.formula}</summary>
            <dl className="mt-xs flex flex-col gap-xxs">
              <dt className="font-medium">{dashboardsCopy.definition}</dt>
              <dd>{w.definition}</dd>
              <dt className="font-medium">{dashboardsCopy.formula}</dt>
              <dd>{w.formula}</dd>
              <dt className="font-medium">{dashboardsCopy.source}</dt>
              <dd>{w.source}</dd>
            </dl>
          </details>
        ) : null}
        {w.drill && w.status === "ok" ? (
          <Link href={w.drill.href} className="text-sm underline print:hidden">
            {dashboardsCopy.drill} →
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function DashboardGrid({ widgets }: { widgets: readonly PresentedWidget[] }) {
  return (
    <div className="grid gap-md md:grid-cols-2 lg:grid-cols-4" data-testid="dashboard-grid">
      {widgets.map((w) => (
        <DashboardWidgetCard key={w.id} widget={w} />
      ))}
    </div>
  );
}
