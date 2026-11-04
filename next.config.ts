import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling Prisma's native query engine binaries.
  // Required for @prisma/client to work correctly in API routes and
  // Server Components. See: https://www.prisma.io/docs/orm/more/help-and-troubleshooting/nextjs
  serverExternalPackages: ["@prisma/client", "prisma"],
  allowedDevOrigins: [
    "10.147.116.11",
    "10.147.116.11:3000",
    "localhost:3000",
  ],
};

export default nextConfig;
