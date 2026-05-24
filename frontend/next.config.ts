import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-pdf uses canvas internally; stub it out for webpack so the PDF
  // component can be used client-side only (with dynamic import + ssr:false).
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  turbopack: {
  },
};

export default nextConfig;
