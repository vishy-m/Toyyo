import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["spectrum-ts", "@spectrum-ts/core", "@spectrum-ts/imessage", "@grpc/grpc-js"],
  // The old dashboard pages were replaced by the cinematic experience; send old links to the collection.
  // Car pages moved from /stories/<car>/<section> to /cars/<car>/<section> ("story" became "overview").
  // Temporary (307) so browsers don't cache them forever while the app is still a prototype.
  async redirects() {
    return [
      ...["/moves", "/finances", "/driving", "/repair", "/stories"].map((source) => ({ source, destination: "/", permanent: false })),
      { source: "/stories/:car/story", destination: "/cars/:car/overview", permanent: false },
      { source: "/stories/:path+", destination: "/cars/:path+", permanent: false },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
