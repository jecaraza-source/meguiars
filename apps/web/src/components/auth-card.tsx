import { APP_NAME } from "@meguiars/domain";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-mg-accent">{APP_NAME}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>
      {children}
    </main>
  );
}
