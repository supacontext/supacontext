import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@supacontext/billing",
    "@supacontext/config",
    "@supacontext/core",
    "@supacontext/db",
    "@supacontext/ui",
    "@supacontext/usage",
  ],
};

export default nextConfig;
