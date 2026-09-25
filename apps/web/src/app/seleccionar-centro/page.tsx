import { authCopy, presentCenterAccess, usableCenters } from "@meguiars/domain";
import { selectCenterAction } from "@/app/actions/auth";
import { AppHeader } from "@/components/app-header";
import { requireScreen } from "@/lib/auth/dal";

export default async function SelectCenterPage() {
  const state = await requireScreen("selectCenter");
  const centers = usableCenters(state.access).map(presentCenterAccess);
  return (
    <>
      <AppHeader state={state} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">{authCopy.selectCenterTitle}</h1>
        <p className="text-mg-muted">{centers.length > 0 ? authCopy.selectCenterHelp : authCopy.noCenters}</p>
        <ul className="flex flex-col gap-3">
          {centers.map((item) => (
            <li key={item.id}>
              <form action={selectCenterAction}>
                <input type="hidden" name="detailCenterId" value={item.id} />
                <button
                  type="submit"
                  aria-current={item.id === state.activeCenterId ? "true" : undefined}
                  className="flex w-full flex-col items-start gap-1 rounded-lg border border-mg-border p-4 text-left hover:border-mg-brand aria-[current=true]:border-mg-brand"
                >
                  <span className="font-semibold">{item.title}</span>
                  <span className="text-sm text-mg-muted">{item.subtitle}</span>
                  <span className="text-sm">{item.rolesText}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
