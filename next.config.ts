import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
    workerThreads: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
