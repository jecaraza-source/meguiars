import { supabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Chequeo básico para monitoreo externo: la app responde y alcanza a Supabase
 * Auth con la llave pública. No expone datos ni configuración (sólo estados y
 * el commit desplegado). 200 = sano; 503 = sin configuración o Supabase caído.
 */
export async function GET() {
  const env = supabaseEnv();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  if (!env) return Response.json({ status: "error", supabase: "sin_configurar", commit }, { status: 503 });
  let supabase: "ok" | "caido" = "caido";
  try {
    const res = await fetch(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.publicKey },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) supabase = "ok";
  } catch {
    supabase = "caido";
  }
  return Response.json(
    { status: supabase === "ok" ? "ok" : "error", supabase, commit },
    { status: supabase === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
