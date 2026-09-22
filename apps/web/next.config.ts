import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @meguiars/core se publica como TypeScript fuente dentro del monorepo.
  transpilePackages: ["@meguiars/core"],
};

export default nextConfig;
