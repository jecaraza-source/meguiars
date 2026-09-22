import { APP_NAME, centersCopy } from "@meguiars/domain";
import { connection } from "next/server";
import { CentersView } from "@/components/centers-view";
import { loadVisibleCenters } from "@/lib/centers";

export default async function Home() {
  // Datos por usuario y hora actual: se renderiza en cada request.
  await connection();
  const state = await loadVisibleCenters();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-mg-accent">{APP_NAME}</p>
        <h1 className="text-2xl font-semibold">{centersCopy.title}</h1>
        <p className="text-mg-muted">{centersCopy.subtitle}</p>
      </header>
      <CentersView state={state} now={new Date()} />
    </main>
  );
}
