import { exchangeRecoveryLink } from "@meguiars/supabase";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Destino del enlace de recuperación de contraseña. Acepta el flujo PKCE
 * (?code=) y el de plantilla con token (?token_hash=&type=recovery).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"), "/restablecer");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/login", origin));

  const result = await exchangeRecoveryLink(supabase, {
    code: searchParams.get("code"),
    tokenHash: searchParams.get("type") === "recovery" ? searchParams.get("token_hash") : null,
  });
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/recuperar?error=${encodeURIComponent(result.error.message)}`, origin),
    );
  }
  return NextResponse.redirect(new URL(next, origin));
}
