import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes @meguiars/* se publican como TypeScript fuente dentro del monorepo.
  transpilePackages: [
    "@meguiars/domain",
    "@meguiars/validation",
    "@meguiars/supabase",
    "@meguiars/ui-tokens",
  ],
};

export default nextConfig;
