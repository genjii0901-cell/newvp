import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
