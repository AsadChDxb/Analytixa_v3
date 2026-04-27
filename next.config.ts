import type { NextConfig } from "next";

const apiProxyTarget = process.env.API_PROXY_TARGET || "http://analytixa.api.countroo.com/api";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
