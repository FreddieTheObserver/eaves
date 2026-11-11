import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // Strapi's Preview opens the web app in an iframe. Nothing else may frame it.
    const cmsOrigin = process.env.CMS_ORIGIN ?? "'none'";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${cmsOrigin}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
