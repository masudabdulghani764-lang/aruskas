import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["bun:sqlite"],
  async redirects() {
    return [
      { source: "/login", destination: "/masuk", permanent: false },
      { source: "/signin", destination: "/masuk", permanent: false },
      { source: "/sign-in", destination: "/masuk", permanent: false },
      { source: "/register", destination: "/daftar", permanent: false },
      { source: "/signup", destination: "/daftar", permanent: false },
      { source: "/sign-up", destination: "/daftar", permanent: false },
    ];
  },
};

export default nextConfig;
