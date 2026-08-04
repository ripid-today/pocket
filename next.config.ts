import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server output for the Docker image (matches Dockerfile).
  output: "standalone",
  // Uploads go directly to R2 via presigned URLs, so no large body ever
  // reaches a Server Action. Range-proxy reads stream through /api/book/[id].
  // No bodySizeLimit needed.
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
