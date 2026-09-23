import {
  centersCopy,
  corporateSummaryText,
  formatInCenterTimeZone,
  presentCenterAccess,
  type AccessBadge,
  type CenterAccess,
  type ViewState,
} from "@meguiars/domain";

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

const BADGE_CLASS: Record<AccessBadge, string> = {
  corporate: "bg-mg-brand text-white",
  inactive: "bg-mg-surface text-mg-danger",
  readOnly: "bg-mg-surface text-mg-muted",
};

export function CentersView({ state, now }: { state: ViewState<CenterAccess[]>; now: Date }) {
  switch (state.status) {
    case "loading":
      return <Notice tone="muted">{centersCopy.loading}</Notice>;
    case "empty":
      return <Notice tone="muted">{centersCopy.empty}</Notice>;
    case "permission_denied":
      return <Notice tone="warning">{centersCopy.permissionDenied}</Notice>;
    case "error":
      return <Notice tone="danger">{state.message}</Notice>;
    case "ready": {
      const summary = corporateSummaryText(state.data);
      return (
        <div className="flex flex-col gap-3">
          {summary ? (
            <p role="status" className="rounded-lg bg-mg-surface p-4 font-medium">
              {summary}
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {state.data.map(presentCenterAccess).map((item) => (
              <li key={item.id} className="flex flex-col gap-1 rounded-lg border border-mg-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.title}</p>
                  {item.badges.map((badge) => (
                    <span
                      key={badge.kind}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASS[badge.kind]}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-mg-muted">{item.subtitle}</p>
                <p className="text-sm">
                  {centersCopy.rolesLabel}: {item.rolesText}
                </p>
                <p className="text-sm text-mg-muted">
                  {centersCopy.timeZoneLabel}: {item.timezone} · {centersCopy.localTimeLabel}:{" "}
                  {formatInCenterTimeZone(now, item.timezone)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }
}
