/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist requires canvas in some paths; stub it out for webpack so
    // PDF components can be used client-side only (dynamic import + ssr:false).
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
