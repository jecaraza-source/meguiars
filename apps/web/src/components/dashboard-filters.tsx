import {
  DASHBOARD_CHANNEL_KEYS,
  DASHBOARD_CHANNEL_LABELS,
  DASHBOARD_ENGINE_KEYS,
  DASHBOARD_ENGINE_LABELS,
  dashboardsCopy,
  PNL_PERIOD_LABELS,
  PNL_PERIODS,
  type DashboardFilters,
} from "@meguiars/domain";

/** Filtros globales (centros, periodo, canal y motor) por GET: la URL es compartible. */
export function DashboardFiltersForm({
  action,
  filters,
  centers,
}: {
  action: string;
  filters: DashboardFilters;
  centers: readonly { id: string; name: string }[];
}) {
  return (
    <form
      method="get"
      action={action}
      className="mg-card flex flex-col gap-md print:hidden"
      aria-label={dashboardsCopy.filters}
    >
      <div className="grid gap-md md:grid-cols-2 lg:grid-cols-4">
        <label className="mg-field">
          <span className="mg-label">{dashboardsCopy.period}</span>
          <select name="periodo" defaultValue={filters.period} className="mg-input">
            {PNL_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PNL_PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="mg-field">
          <span className="mg-label">{dashboardsCopy.from}</span>
          <input type="date" name="desde" defaultValue={filters.from} className="mg-input" />
        </label>
        <label className="mg-field">
          <span className="mg-label">{dashboardsCopy.to}</span>
          <input type="date" name="hasta" defaultValue={filters.to} className="mg-input" />
        </label>
        <label className="mg-field">
          <span className="mg-label">{dashboardsCopy.channel}</span>
          <select name="canal" defaultValue={filters.channel ?? ""} className="mg-input">
            <option value="">{dashboardsCopy.all}</option>
            {DASHBOARD_CHANNEL_KEYS.map((c) => (
              <option key={c} value={c}>
                {DASHBOARD_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="mg-field">
          <span className="mg-label">{dashboardsCopy.engine}</span>
          <select name="motor" defaultValue={filters.engine ?? ""} className="mg-input">
            <option value="">{dashboardsCopy.all}</option>
            {DASHBOARD_ENGINE_KEYS.map((e) => (
              <option key={e} value={e}>
                {DASHBOARD_ENGINE_LABELS[e]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-xs lg:col-span-3">
          <legend className="mg-label">{dashboardsCopy.centers}</legend>
          <div className="flex flex-wrap gap-md">
            {centers.map((c) => (
              <label key={c.id} className="flex items-center gap-sm text-sm">
                <input
                  type="checkbox"
                  name="centros"
                  value={c.id}
                  defaultChecked={filters.centerIds.includes(c.id)}
                  className="size-lg accent-brand"
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div>
        <button type="submit" className="mg-btn" data-variant="primary" data-size="sm">
          {dashboardsCopy.apply}
        </button>
      </div>
    </form>
  );
}
