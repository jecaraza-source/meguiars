import type { Database } from "@meguiars/supabase";
import { parseSupabasePublicEnv } from "@meguiars/validation";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookies";
import { isPublicPath } from "@/lib/auth/redirects";

/**
 * Refresca la sesión de Supabase en cada petición (escribe las cookies
 * renovadas) y hace un chequeo optimista: sin sesión, las rutas privadas van a
 * /login. La autorización real está en lib/auth/dal.ts y en RLS.
 */
export async function proxy(request: NextRequest) {
  const env = parseSupabasePublicEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(env.url, env.publicKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifica el JWT (y lo refresca si expiró). No agregar lógica entre la
  // creación del cliente y esta llamada.
  const { data } = await supabase.auth.getClaims();

  const { pathname, search } = request.nextUrl;
  if (!data?.claims && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  // Todo excepto estáticos e imágenes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
