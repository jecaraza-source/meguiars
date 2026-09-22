import { centersCopy, formatInCenterTimeZone, type DetailCenter, type ViewState } from "@meguiars/domain";

function Notice({ tone, children }: { tone: "muted" | "warning" | "danger"; children: React.ReactNode }) {
  const color = {
    muted: "text-mg-muted",
    warning: "text-mg-warning",
    danger: "text-mg-danger",
  }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-lg bg-mg-surface p-4 ${color}`}>
      {children}
    </p>
  );
}

export function CentersView({ state, now }: { state: ViewState<DetailCenter[]>; now: Date }) {
  switch (state.status) {
    case "loading":
      return <Notice tone="muted">{centersCopy.loading}</Notice>;
    case "empty":
      return <Notice tone="muted">{centersCopy.empty}</Notice>;
    case "permission_denied":
      return <Notice tone="warning">{centersCopy.permissionDenied}</Notice>;
    case "error":
      return <Notice tone="danger">{state.message}</Notice>;
    case "ready":
      return (
        <ul className="flex flex-col gap-3">
          {state.data.map((center) => (
            <li key={center.id} className="rounded-lg border border-mg-border p-4">
              <p className="font-semibold">{center.name}</p>
              <p className="text-sm text-mg-muted">{center.code}</p>
              <p className="text-sm text-mg-muted">
                {centersCopy.timeZoneLabel}: {center.timezone} · {centersCopy.localTimeLabel}:{" "}
                {formatInCenterTimeZone(now, center.timezone)}
              </p>
            </li>
          ))}
        </ul>
      );
  }
}
