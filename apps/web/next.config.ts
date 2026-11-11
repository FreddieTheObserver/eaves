import type { NextConfig } from "next";

// Image URLs are absolute and start with S3_PUBLIC_URL (section 11 of the design document).
const mediaBase = process.env.S3_PUBLIC_URL;
if (!mediaBase) throw new Error("S3_PUBLIC_URL is not set");
const media = new URL(`${mediaBase.replace(/\/+$/, "")}/**`);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [media],
    // Uploads are named with a content hash, so a changed image arrives at a new URL and an optimized copy can live long.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    // The optimizer refuses loopback addresses, and the local MinIO sits on one.
    dangerouslyAllowLocalIP: ["127.0.0.1", "localhost", "[::1]"].includes(media.hostname),
  },
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
