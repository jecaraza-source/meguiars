"use client";

import { useId, useState } from "react";

/**
 * Gráficas ligeras (sin dependencias) del sistema de diseño:
 * - colores de serie en orden fijo (chart1 → chart3), nunca para estados;
 * - marcas delgadas (columnas ≤ 24 px, línea de 2 px), rejilla tenue, un solo eje;
 * - tooltip al pasar o enfocar (columna, barra o posición de la línea);
 * - leyenda con 2+ series y tabla con los mismos datos («Ver datos»), así la
 *   identidad nunca depende sólo del color.
 * Los textos llegan formateados desde el servidor; los ejes se compactan aquí.
 */

export interface ChartSeries {
  name: string;
  /** Posición en la paleta (orden fijo). */
  color: 1 | 2 | 3;
  values: number[];
  display: string[];
}

export interface ChartData {
  categories: { key: string; label: string; long: string }[];
  series: ChartSeries[];
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  display: string;
  note: string | null;
}

const FILL = { 1: "bg-chart1", 2: "bg-chart2", 3: "bg-chart3" } as const;
const STROKE = { 1: "stroke-chart1", 2: "stroke-chart2", 3: "stroke-chart3" } as const;

const compact = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Marcas «redondas» del eje: 0 y 3–4 pasos limpios que cubren el rango. */
function niceScale(values: number[]) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step || step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return { ticks, pct };
}

/** Sin movimientos en el periodo: se dice «sin datos» en vez de dibujar ceros. */
const isEmpty = (data: ChartData) => data.series.every((s) => s.values.every((v) => v === 0));

function NoData() {
  return <p className="py-xl text-center text-sm text-muted">Sin datos en el periodo.</p>;
}

function Legend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-md text-xs text-muted" aria-label="Series">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-xs">
          <span aria-hidden="true" className={`size-sm rounded-sm ${FILL[s.color]}`} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ data, caption }: { data: ChartData; caption: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline">Ver datos</summary>
      <div className="mt-xs overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="px-sm py-xs text-left font-medium">
                Periodo
              </th>
              {data.series.map((s) => (
                <th key={s.name} scope="col" className="px-sm py-xs text-right font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c, i) => (
              <tr key={c.key} className="border-t border-border">
                <th scope="row" className="px-sm py-xs text-left font-normal">
                  {c.long}
                </th>
                {data.series.map((s) => (
                  <td key={s.name} className="px-sm py-xs text-right tabular-nums">
                    {s.display[i]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Axis({ ticks, pct }: ReturnType<typeof niceScale>) {
  return (
    <div
      aria-hidden="true"
      className="relative h-(--mg-layout-chart) w-(--mg-layout-axis) shrink-0 text-xs text-muted"
    >
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute right-xs -translate-y-1/2 tabular-nums"
          style={{ top: `${100 - pct(t)}%` }}
        >
          {compact.format(t)}
        </span>
      ))}
    </div>
  );
}

function Grid({ ticks, pct }: ReturnType<typeof niceScale>) {
  return (
    <>
      {ticks.map((t) => (
        <div
          key={t}
          aria-hidden="true"
          className={`absolute inset-x-0 border-t ${t === 0 ? "border-border-strong" : "border-border"}`}
          style={{ top: `${100 - pct(t)}%` }}
        />
      ))}
    </>
  );
}

/** Lugar del tooltip: centrado, o pegado al borde en los extremos para no salirse. */
const tipPlace = (i: number, n: number) =>
  i < n * 0.2 ? { left: 0 } : i >= n * 0.8 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" };

function Tooltip({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; color: 1 | 2 | 3; value: string }[];
}) {
  return (
    <>
      <p className="mb-xxs font-medium text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-xs whitespace-nowrap">
          <span aria-hidden="true" className={`h-xxs w-md rounded-full ${FILL[r.color]}`} />
          <strong className="tabular-nums text-foreground">{r.value}</strong>
          {rows.length > 1 ? <span className="text-muted">{r.name}</span> : null}
        </p>
      ))}
    </>
  );
}

/** Columnas (una o varias series por periodo); los negativos bajan del cero. */
export function ColumnChart(props: { data: ChartData; caption: string; labelEvery?: number }) {
  return isEmpty(props.data) ? <NoData /> : <Columns {...props} />;
}

function Columns({
  data,
  caption,
  labelEvery = 1,
}: {
  data: ChartData;
  caption: string;
  labelEvery?: number;
}) {
  const scale = niceScale(data.series.flatMap((s) => s.values));
  const zero = scale.pct(0);
  const n = data.categories.length;
  return (
    <figure className="flex flex-col gap-sm">
      <figcaption className="sr-only">{caption}</figcaption>
      <Legend series={data.series} />
      <div className="flex gap-xs">
        <Axis {...scale} />
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <div className="relative h-(--mg-layout-chart)">
            <Grid {...scale} />
            <div className="absolute inset-0 flex">
              {data.categories.map((c, i) => (
                <div
                  key={c.key}
                  tabIndex={0}
                  aria-label={`${c.long}: ${data.series.map((s) => `${s.name} ${s.display[i]}`).join(", ")}`}
                  className="group relative flex flex-1 justify-center gap-xxs px-xxs outline-none"
                >
                  {data.series.map((s) => {
                    const v = s.values[i] ?? 0;
                    const h = Math.abs(scale.pct(v) - zero);
                    return (
                      <div key={s.name} className="relative h-full max-w-(--mg-space-xl) flex-1">
                        <div
                          className={`absolute inset-x-0 transition-opacity group-hover:opacity-75 group-focus-visible:opacity-75 ${FILL[s.color]} ${
                            v >= 0 ? "rounded-t-sm" : "rounded-b-sm"
                          }`}
                          style={
                            v >= 0
                              ? { bottom: `${zero}%`, height: `${h}%` }
                              : { top: `${100 - zero}%`, height: `${h}%` }
                          }
                        />
                      </div>
                    );
                  })}
                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-(--mg-z-overlay) mb-xs hidden rounded-md border border-border bg-surface-raised p-sm text-xs shadow-md group-hover:block group-focus-visible:block`}
                    style={tipPlace(i, n)}
                  >
                    <Tooltip
                      title={c.long}
                      rows={data.series.map((s) => ({
                        name: s.name,
                        color: s.color,
                        value: s.display[i] ?? "",
                      }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div aria-hidden="true" className="flex text-xs text-muted">
            {data.categories.map((c, i) => (
              <span key={c.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
                {i % labelEvery === 0 ? c.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <DataTable data={data} caption={caption} />
    </figure>
  );
}

/** Líneas (una por serie) con cruz que sigue al puntero o a las flechas del teclado. */
export function LineChart(props: { data: ChartData; caption: string; labelEvery?: number }) {
  return isEmpty(props.data) ? <NoData /> : <Lines {...props} />;
}

function Lines({ data, caption, labelEvery = 1 }: { data: ChartData; caption: string; labelEvery?: number }) {
  const scale = niceScale(data.series.flatMap((s) => s.values));
  const n = data.categories.length;
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - scale.pct(v);
  const pick = (clientX: number, rect: DOMRect) =>
    setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - rect.left) / rect.width) * (n - 1)))));
  const at = hover ?? n - 1;
  return (
    <figure className="flex flex-col gap-sm">
      <figcaption className="sr-only">{caption}</figcaption>
      <Legend series={data.series} />
      <div className="flex gap-xs">
        <Axis {...scale} />
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <div
            className="relative h-(--mg-layout-chart) outline-none"
            tabIndex={0}
            aria-describedby={`${id}-tip`}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover(Math.max(0, at - 1));
              if (e.key === "ArrowRight") setHover(Math.min(n - 1, at + 1));
            }}
          >
            <Grid {...scale} />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 size-full overflow-visible"
            >
              {data.series.map((s) => (
                <polyline
                  key={s.name}
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className={STROKE[s.color]}
                />
              ))}
            </svg>
            {hover !== null ? (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 border-l border-border-strong"
                style={{ left: `${x(hover)}%` }}
              />
            ) : null}
            {data.series.map((s) => (
              <span
                key={s.name}
                aria-hidden="true"
                className={`absolute size-sm -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-raised ${FILL[s.color]}`}
                style={{ left: `${x(at)}%`, top: `${y(s.values[at] ?? 0)}%` }}
              />
            ))}
            <div
              id={`${id}-tip`}
              role="tooltip"
              className={`pointer-events-none absolute top-0 z-(--mg-z-overlay) rounded-md border border-border bg-surface-raised p-sm text-xs shadow-md ${
                hover === null ? "sr-only" : ""
              } ${at < n / 2 ? "" : "-translate-x-full"}`}
              style={{ left: `${x(at)}%` }}
            >
              <Tooltip
                title={data.categories[at]?.long ?? ""}
                rows={data.series.map((s) => ({ name: s.name, color: s.color, value: s.display[at] ?? "" }))}
              />
            </div>
          </div>
          <div aria-hidden="true" className="flex justify-between text-xs text-muted">
            {data.categories.map((c, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <span key={c.key} className="whitespace-nowrap">
                  {c.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <DataTable data={data} caption={caption} />
    </figure>
  );
}

/** Barras horizontales ordenadas (una serie): valor en la punta y detalle al pasar o enfocar. */
export function BarList({ rows, caption }: { rows: BarDatum[]; caption: string }) {
  if (rows.every((r) => r.value === 0)) return <NoData />;
  const max = Math.max(0, ...rows.map((r) => r.value)) || 1;
  return (
    <figure className="flex flex-col gap-sm">
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-col gap-sm">
        {rows.map((r) => (
          <li
            key={r.key}
            tabIndex={0}
            aria-label={`${r.label}: ${r.display}${r.note ? `, ${r.note}` : ""}`}
            className="group relative flex flex-col gap-xxs outline-none"
          >
            <div className="flex items-baseline justify-between gap-sm text-sm">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{r.display}</span>
            </div>
            <div aria-hidden="true" className="h-md rounded-sm bg-surface">
              <div
                className="h-full rounded-r-sm bg-chart1 transition-opacity group-hover:opacity-75 group-focus-visible:opacity-75"
                style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }}
              />
            </div>
            {r.note ? (
              <p className="hidden text-xs text-muted group-hover:block group-focus-visible:block">
                {r.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </figure>
  );
}
