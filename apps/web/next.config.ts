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
    // Fotos de evidencia: el navegador las redimensiona (≤ 1600 px, JPEG) antes de
    // enviarlas; el bucket acepta hasta 5 MB. Margen para el multipart.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Los paquetes @meguiars/* se publican como TypeScript fuente dentro del monorepo.
  transpilePackages: [
    "@meguiars/domain",
    "@meguiars/validation",
    "@meguiars/supabase",
    "@meguiars/ui-tokens",
  ],
};

export default nextConfig;
