import { authCopy, presentCenterAccess, usableCenters } from "@meguiars/domain";
import { selectCenterAction } from "@/app/actions/auth";
import { PlainShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

export default async function SelectCenterPage() {
  const state = await requireScreen("selectCenter");
  const centers = usableCenters(state.access).map(presentCenterAccess);
  return (
    <PlainShell title={authCopy.selectCenterTitle}>
      <p className="text-muted">{centers.length > 0 ? authCopy.selectCenterHelp : authCopy.noCenters}</p>
      <ul className="flex flex-col gap-sm">
        {centers.map((item) => (
          <li key={item.id}>
            <form action={selectCenterAction}>
              <input type="hidden" name="detailCenterId" value={item.id} />
              <button
                type="submit"
                aria-current={item.id === state.activeCenterId ? "true" : undefined}
                className="mg-card w-full text-left hover:border-border-strong aria-[current=true]:border-brand"
              >
                <span className="font-semibold">{item.title}</span>
                <span className="text-sm text-muted">{item.subtitle}</span>
                <span className="flex flex-wrap gap-xs">
                  <Badge label={item.rolesText} />
                  {item.badges.map((b) => (
                    <Badge key={b.kind} label={b.label} tone={b.kind === "corporate" ? "brand" : "neutral"} />
                  ))}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </PlainShell>
  );
}
