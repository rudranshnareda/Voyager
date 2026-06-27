import type { NextConfig } from "next";

const RAILWAY_URL = "https://voyager-production-58d9.up.railway.app";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  turbopack: {},
  async rewrites() {
    return [
      {
        source: "/proxy/:path*",
        destination: `${RAILWAY_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
