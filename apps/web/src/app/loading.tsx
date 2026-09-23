import { centersCopy } from "@meguiars/domain";
import { CentersView } from "@/components/centers-view";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{centersCopy.title}</h1>
      <CentersView state={{ status: "loading" }} now={new Date()} />
    </main>
  );
}
