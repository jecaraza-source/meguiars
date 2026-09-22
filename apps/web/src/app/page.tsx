import { APP_NAME, formatInCenterTimeZone } from "@meguiars/core";

// La hora del servidor se renderiza en cada request.
export const dynamic = "force-dynamic";

export default function Home() {
  const now = formatInCenterTimeZone(new Date(), "America/Mexico_City");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Plataforma de operación · web</p>
      <p className="text-sm text-zinc-500">{now} (America/Mexico_City)</p>
    </main>
  );
}
