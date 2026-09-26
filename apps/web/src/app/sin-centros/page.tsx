import { authCopy } from "@meguiars/domain";
import { AppHeader } from "@/components/app-header";
import { requireScreen } from "@/lib/auth/dal";

export default async function NoCentersPage() {
  const state = await requireScreen("account");
  return (
    <>
      <AppHeader state={state} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-6">
        <h1 className="text-2xl font-semibold">{authCopy.noCentersTitle}</h1>
        <p className="text-mg-muted">{authCopy.noCenters}</p>
      </main>
    </>
  );
}
