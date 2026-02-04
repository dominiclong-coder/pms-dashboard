import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for GitHub Pages
  output: "export",

  // Set base path for GitHub Pages (charliezima.github.io/pms-dashboard)
  basePath: "/pms-dashboard",
  assetPrefix: "/pms-dashboard",

  // Disable image optimization (not supported in static export)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
