"use client";

import {
  APP_ROLES,
  DASHBOARD_RANGE_LABELS,
  DASHBOARD_RANGES,
  dashboardsCopy,
  GRID_COLUMNS,
  MAX_ROW_SPAN,
  MAX_WIDGETS,
  moveInOrder,
  moveTo,
  ROLE_LABELS,
  WIDGET_BREAKDOWN_LABELS,
  WIDGET_GRAIN_LABELS,
  WIDGET_GRAINS,
  WIDGET_TYPE_LABELS,
  type AppRole,
  type DashboardDefinition,
  type DashboardInput,
  type DashboardRange,
  type DashboardWidgetType,
  type SavedDashboardFilters,
  type WidgetBreakdown,
  type WidgetOptionsValue,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  archiveDashboardAction,
  resetDashboardViewAction,
  saveDashboardAction,
  saveDashboardViewAction,
  type DashboardsFormState,
} from "@/app/actions/dashboards";
import { widgetSpanClass } from "./dashboard-widgets";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

function FormError({ state }: { state: DashboardsFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

function useSuccessToast(state: DashboardsFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

// ---------------------------------------------------------------------------
// Vista personal (orden, ocultos, filtros y favorito)
// ---------------------------------------------------------------------------

export function DashboardViewEditor({
  dashboardId,
  visible,
  hidden,
  filters,
  isFavorite,
}: {
  dashboardId: string;
  visible: { id: string; title: string }[];
  hidden: { id: string; title: string }[];
  filters: SavedDashboardFilters;
  isFavorite: boolean;
}) {
  const [state, action] = useActionState(saveDashboardViewAction, {});
  const [resetState, reset] = useActionState(resetDashboardViewAction, {});
  useSuccessToast(state);
  const all = [...visible, ...hidden];
  const title = (id: string) => all.find((w) => w.id === id)?.title ?? id;
  const [order, setOrder] = useState(all.map((w) => w.id));
  const [off, setOff] = useState(hidden.map((w) => w.id));
  const toggle = (id: string) => setOff((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  return (
    <div className="flex flex-col gap-md" data-testid="view-editor">
      <form action={action} className="flex flex-col gap-md">
        <input type="hidden" name="dashboardId" value={dashboardId} />
        <input type="hidden" name="order" value={JSON.stringify(order)} />
        <input type="hidden" name="hidden" value={JSON.stringify(off)} />
        <input type="hidden" name="filters" value={JSON.stringify(filters)} />
        <FormError state={state} />
        <ol className="flex flex-col gap-xs" aria-label={dashboardsCopy.myView}>
          {order.map((id, i) => (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-sm border-b border-border pb-xs"
            >
              <span className={`text-sm ${off.includes(id) ? "text-muted line-through" : ""}`}>
                {title(id)}
              </span>
              <span className="flex gap-xs">
                <Button
                  label={dashboardsCopy.moveUp}
                  size="sm"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => setOrder((o) => moveInOrder(o, id, -1))}
                  aria-label={`${dashboardsCopy.moveUp} ${title(id)}`}
                />
                <Button
                  label={dashboardsCopy.moveDown}
                  size="sm"
                  variant="ghost"
                  disabled={i === order.length - 1}
                  onClick={() => setOrder((o) => moveInOrder(o, id, 1))}
                  aria-label={`${dashboardsCopy.moveDown} ${title(id)}`}
                />
                <Button
                  label={off.includes(id) ? dashboardsCopy.show : dashboardsCopy.hide}
                  size="sm"
                  variant="secondary"
                  onClick={() => toggle(id)}
                  aria-label={`${off.includes(id) ? dashboardsCopy.show : dashboardsCopy.hide} ${title(id)}`}
                />
              </span>
            </li>
          ))}
        </ol>
        <Checkbox name="favorite" value="1" label={dashboardsCopy.setFavorite} checked={isFavorite} />
        <p className="text-xs text-muted">La vista guarda también los filtros aplicados ahora.</p>
        <div className="flex flex-wrap gap-sm">
          <Submit label={dashboardsCopy.saveView} />
        </div>
      </form>
      <form action={reset}>
        <input type="hidden" name="dashboardId" value={dashboardId} />
        <FormError state={resetState} />
        <Submit label={dashboardsCopy.resetView} variant="secondary" />
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constructor (admin corporativo)
// ---------------------------------------------------------------------------

/** Métrica registrada ofrecida en el constructor (sin funciones: viaja al cliente). */
export interface MetricOption {
  id: string;
  name: string;
  description: string;
  sourceLabel: string;
  widgets: readonly DashboardWidgetType[];
  breakdowns: readonly WidgetBreakdown[];
  series: boolean;
}

interface DraftWidget {
  key: string;
  id?: string | undefined;
  metricId: string;
  type: DashboardWidgetType;
  title: string;
  colSpan: number;
  rowSpan: number;
  options: WidgetOptionsValue;
}

let seq = 0;
const newKey = () => `n${++seq}`;

const defaultsFor = (
  type: DashboardWidgetType,
  metric: MetricOption,
): Pick<DraftWidget, "colSpan" | "rowSpan" | "options"> => {
  if (type === "kpi") return { colSpan: 1, rowSpan: 1, options: {} };
  if (type === "timeseries") return { colSpan: 2, rowSpan: 2, options: { grain: "auto" } };
  if (type === "ranking") return { colSpan: 2, rowSpan: 1, options: { limit: 10 } };
  if (type === "distribution")
    return { colSpan: 2, rowSpan: 2, options: { breakdown: metric.breakdowns[0] } };
  return { colSpan: 2, rowSpan: 1, options: {} };
};

const numberOptions = (max: number, label: (n: number) => string) =>
  Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: label(i + 1) }));

export function DashboardBuilder({
  organizationId,
  requestId,
  dashboard,
  metrics,
  centers,
}: {
  organizationId: string;
  requestId: string;
  dashboard: DashboardDefinition | null;
  metrics: MetricOption[];
  centers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveDashboardAction, {});
  const metricOf = (id: string) => metrics.find((m) => m.id === id);
  const [name, setName] = useState(dashboard?.name ?? "");
  const [description, setDescription] = useState(dashboard?.description ?? "");
  const [audience, setAudience] = useState<AppRole | "">(dashboard?.audienceRole ?? "");
  const [allCenters, setAllCenters] = useState(!dashboard?.centerIds);
  const [centerIds, setCenterIds] = useState<string[]>(dashboard?.centerIds ?? centers.map((c) => c.id));
  const [range, setRange] = useState<DashboardRange>(dashboard?.defaultRange ?? "mes");
  const [isDefault, setIsDefault] = useState(dashboard?.isDefault ?? false);
  const [reason, setReason] = useState("");
  const [widgets, setWidgets] = useState<DraftWidget[]>(
    (dashboard?.widgets ?? []).map((w) => ({
      key: w.id,
      id: w.id,
      metricId: w.metricId,
      type: w.type,
      title: w.title ?? "",
      colSpan: w.colSpan,
      rowSpan: w.rowSpan,
      options: w.options,
    })),
  );
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const firstMetric = metrics[0];
  const [newMetric, setNewMetric] = useState(firstMetric?.id ?? "");
  const [newType, setNewType] = useState<DashboardWidgetType>(firstMetric?.widgets[0] ?? "kpi");

  const patch = (key: string, p: Partial<DraftWidget>) =>
    setWidgets((ws) => ws.map((w) => (w.key === key ? { ...w, ...p } : w)));
  const add = () => {
    const m = metricOf(newMetric);
    if (!m || widgets.length >= MAX_WIDGETS) return;
    const type = m.widgets.includes(newType) ? newType : m.widgets[0]!;
    setWidgets((ws) => [...ws, { key: newKey(), metricId: m.id, type, title: "", ...defaultsFor(type, m) }]);
  };

  const payload: DashboardInput = {
    organizationId,
    ...(dashboard ? { id: dashboard.id, version: dashboard.version, reason } : { requestId }),
    name,
    description,
    audienceRole: isDefault ? null : audience || null,
    centerIds: isDefault || allCenters ? null : centerIds,
    defaultRange: range,
    isDefault,
    widgets: widgets.map((w) => ({
      ...(w.id ? { id: w.id } : {}),
      metricId: w.metricId,
      type: w.type,
      title: w.title,
      colSpan: w.colSpan,
      rowSpan: w.rowSpan,
      options: w.options,
    })),
  };
  const newMetricOption = metricOf(newMetric);
  const groups = [...new Set(metrics.map((m) => m.sourceLabel))];

  return (
    <form action={action} className="flex flex-col gap-lg" data-testid="dashboard-builder">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <FormError state={state} />
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="name"
          label={dashboardsCopy.name}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          name="description"
          label={dashboardsCopy.descriptionLabel}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select
          name="audience"
          label={dashboardsCopy.audience}
          value={isDefault ? "" : audience}
          disabled={isDefault}
          onChange={(e) => setAudience(e.target.value as AppRole | "")}
          options={[
            { value: "", label: dashboardsCopy.audienceAll },
            ...APP_ROLES.filter((r) => r !== "operador_recepcion").map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
            })),
          ]}
        />
        <Select
          name="defaultRange"
          label={dashboardsCopy.defaultRange}
          value={range}
          onChange={(e) => setRange(e.target.value as DashboardRange)}
          options={DASHBOARD_RANGES.map((r) => ({ value: r, label: DASHBOARD_RANGE_LABELS[r] }))}
        />
      </div>
      <fieldset className="flex flex-col gap-xs" disabled={isDefault}>
        <legend className="mg-label">{dashboardsCopy.allowedCenters}</legend>
        <label className="flex items-center gap-sm text-sm">
          <input
            type="checkbox"
            className="size-lg accent-brand"
            checked={allCenters || isDefault}
            onChange={(e) => setAllCenters(e.target.checked)}
          />
          {dashboardsCopy.centersAll}
        </label>
        {!allCenters && !isDefault
          ? centers.map((c) => (
              <label key={c.id} className="flex items-center gap-sm text-sm">
                <input
                  type="checkbox"
                  className="size-lg accent-brand"
                  checked={centerIds.includes(c.id)}
                  onChange={(e) =>
                    setCenterIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))
                  }
                />
                {c.name}
              </label>
            ))
          : null}
      </fieldset>
      <label className="flex items-center gap-sm text-sm">
        <input
          type="checkbox"
          className="size-lg accent-brand"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        {dashboardsCopy.isDefault}
      </label>

      <section className="flex flex-col gap-md" aria-label={dashboardsCopy.widgets}>
        <header className="flex flex-col gap-xxs">
          <h2 className="text-lg font-bold text-accent">{dashboardsCopy.widgets}</h2>
          <p className="text-sm text-muted">
            {dashboardsCopy.dragHint} {dashboardsCopy.noSqlNote}
          </p>
        </header>
        <ol className="grid gap-md md:grid-cols-2 lg:grid-cols-4" data-testid="builder-grid">
          {widgets.map((w, i) => {
            const m = metricOf(w.metricId);
            return (
              <li
                key={w.key}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null) setWidgets((ws) => moveTo(ws, dragFrom, i));
                  setDragFrom(null);
                }}
                className={`mg-card flex cursor-move flex-col gap-sm ${widgetSpanClass(w.colSpan, w.rowSpan)}`}
                aria-label={`${i + 1}. ${m?.name ?? w.metricId}`}
              >
                <p className="text-sm font-bold">
                  {i + 1}. {m?.name ?? w.metricId}
                </p>
                <p className="text-xs text-muted">{WIDGET_TYPE_LABELS[w.type]}</p>
                <Select
                  name={`type-${w.key}`}
                  id={`type-${w.key}`}
                  label={dashboardsCopy.widgetType}
                  value={w.type}
                  onChange={(e) => {
                    const type = e.target.value as DashboardWidgetType;
                    patch(w.key, { type, ...(m ? defaultsFor(type, m) : {}) });
                  }}
                  options={(m?.widgets ?? [w.type]).map((t) => ({ value: t, label: WIDGET_TYPE_LABELS[t] }))}
                />
                <Input
                  name={`title-${w.key}`}
                  id={`title-${w.key}`}
                  label={dashboardsCopy.widgetTitle}
                  value={w.title}
                  maxLength={60}
                  onChange={(e) => patch(w.key, { title: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-sm">
                  <Select
                    name={`w-${w.key}`}
                    id={`w-${w.key}`}
                    label={dashboardsCopy.width}
                    value={String(w.colSpan)}
                    onChange={(e) => patch(w.key, { colSpan: Number(e.target.value) })}
                    options={numberOptions(GRID_COLUMNS, dashboardsCopy.columns)}
                  />
                  <Select
                    name={`h-${w.key}`}
                    id={`h-${w.key}`}
                    label={dashboardsCopy.height}
                    value={String(w.rowSpan)}
                    onChange={(e) => patch(w.key, { rowSpan: Number(e.target.value) })}
                    options={numberOptions(MAX_ROW_SPAN, dashboardsCopy.rows)}
                  />
                </div>
                {w.type === "timeseries" ? (
                  <Select
                    name={`g-${w.key}`}
                    id={`g-${w.key}`}
                    label={dashboardsCopy.grain}
                    value={w.options.grain ?? "auto"}
                    onChange={(e) =>
                      patch(w.key, { options: { grain: e.target.value as WidgetOptionsValue["grain"] } })
                    }
                    options={WIDGET_GRAINS.map((g) => ({ value: g, label: WIDGET_GRAIN_LABELS[g] }))}
                  />
                ) : null}
                {w.type === "ranking" ? (
                  <Input
                    name={`l-${w.key}`}
                    id={`l-${w.key}`}
                    type="number"
                    min={3}
                    max={20}
                    label={dashboardsCopy.limit}
                    value={String(w.options.limit ?? 10)}
                    onChange={(e) => patch(w.key, { options: { limit: Number(e.target.value) } })}
                  />
                ) : null}
                {w.type === "distribution" && m ? (
                  <Select
                    name={`b-${w.key}`}
                    id={`b-${w.key}`}
                    label={dashboardsCopy.breakdown}
                    value={w.options.breakdown ?? m.breakdowns[0] ?? ""}
                    onChange={(e) =>
                      patch(w.key, { options: { breakdown: e.target.value as WidgetBreakdown } })
                    }
                    options={m.breakdowns.map((b) => ({ value: b, label: WIDGET_BREAKDOWN_LABELS[b] }))}
                  />
                ) : null}
                <div className="flex flex-wrap gap-xs">
                  <Button
                    label={dashboardsCopy.moveUp}
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => setWidgets((ws) => moveTo(ws, i, i - 1))}
                  />
                  <Button
                    label={dashboardsCopy.moveDown}
                    size="sm"
                    variant="ghost"
                    disabled={i === widgets.length - 1}
                    onClick={() => setWidgets((ws) => moveTo(ws, i, i + 1))}
                  />
                  <Button
                    label={dashboardsCopy.remove}
                    size="sm"
                    variant="danger"
                    onClick={() => setWidgets((ws) => ws.filter((x) => x.key !== w.key))}
                    aria-label={`${dashboardsCopy.remove} ${m?.name ?? w.metricId}`}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mg-card flex flex-col gap-sm" data-testid="add-widget">
          <h3 className="text-sm font-bold">{dashboardsCopy.addWidget}</h3>
          <div className="grid gap-sm md:grid-cols-2">
            <label className="mg-field">
              <span className="mg-label">{dashboardsCopy.metric}</span>
              <select
                className="mg-input"
                name="newMetric"
                value={newMetric}
                onChange={(e) => {
                  setNewMetric(e.target.value);
                  const m = metricOf(e.target.value);
                  if (m && !m.widgets.includes(newType)) setNewType(m.widgets[0]!);
                }}
              >
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {metrics
                      .filter((m) => m.sourceLabel === g)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <Select
              name="newType"
              label={dashboardsCopy.widgetType}
              value={newType}
              onChange={(e) => setNewType(e.target.value as DashboardWidgetType)}
              options={(newMetricOption?.widgets ?? []).map((t) => ({
                value: t,
                label: WIDGET_TYPE_LABELS[t],
              }))}
            />
          </div>
          {newMetricOption ? <p className="text-xs text-muted">{newMetricOption.description}</p> : null}
          <div>
            <Button
              label={dashboardsCopy.addWidget}
              size="sm"
              variant="secondary"
              onClick={add}
              disabled={widgets.length >= MAX_WIDGETS}
            />
          </div>
        </div>
      </section>

      {dashboard ? (
        <Input
          name="reason"
          label={dashboardsCopy.reason}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      <div className="flex flex-wrap gap-sm">
        <Submit label={dashboardsCopy.save} />
      </div>
    </form>
  );
}

export function ArchiveDashboardForm({ id, version }: { id: string; version: number }) {
  const [state, action] = useActionState(archiveDashboardAction, {});
  return (
    <form action={action} className="flex flex-col gap-sm">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <FormError state={state} />
      <Input
        name="reason"
        id="archive-reason"
        label={dashboardsCopy.archiveReason}
        required
        error={state.fields?.reason}
      />
      <div>
        <Submit label={dashboardsCopy.archive} variant="danger" />
      </div>
    </form>
  );
}
