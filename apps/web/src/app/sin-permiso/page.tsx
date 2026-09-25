import { authCopy } from "@meguiars/domain";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireScreen } from "@/lib/auth/dal";

export default async function ForbiddenPage() {
  const state = await requireScreen("account");
  return (
    <>
      <AppHeader state={state} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-6">
        <h1 className="text-2xl font-semibold">{authCopy.forbiddenTitle}</h1>
        <p className="text-mg-muted">{authCopy.forbidden}</p>
        <Link href="/" className="underline">
          Ir al inicio
        </Link>
      </main>
    </>
  );
}
