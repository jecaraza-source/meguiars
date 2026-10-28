import { checkSupabaseTarget, resolveAppEnvironment } from "@meguiars/domain";
import type { NextConfig } from "next";

// Falla el build (no la primera petición) si el ambiente es desconocido o si un
// build de preview/production apunta a un Supabase local.
checkSupabaseTarget(
  resolveAppEnvironment(process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV),
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

const nextConfig: NextConfig = {
  experimental: {
    // Fotos de evidencia: el navegador las redimensiona (≤ 1600 px, JPEG); el bucket
    // acepta hasta 5 MB. Comprobantes de egresos (foto o PDF): hasta 10 MB. Margen
    // para el multipart.
    serverActions: { bodySizeLimit: "11mb" },
  },
  // Encabezados de seguridad: nadie puede incrustar la app en otro sitio (evita
  // clics engañosos sobre pantallas con sesión), sin adivinar tipos de archivo y
  // sin mandar la URL completa a otros sitios. La cámara sólo para este sitio
  // (fotos de evidencia).
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  poweredByHeader: false,
  // Los paquetes @meguiars/* se publican como TypeScript fuente dentro del monorepo.
  transpilePackages: [
    "@meguiars/analytics",
    "@meguiars/domain",
    "@meguiars/validation",
    "@meguiars/supabase",
    "@meguiars/ui-tokens",
  ],
};

export default nextConfig;
