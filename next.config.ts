import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for GitHub Pages
  output: "export",

  // Set base path if deploying to a subpath (e.g., username.github.io/repo-name)
  // Uncomment and set this if your repo is not username.github.io
  // basePath: "/myproductcares-dashboard",

  // Disable image optimization (not supported in static export)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
