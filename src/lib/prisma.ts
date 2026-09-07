/**
 * @file src/lib/prisma.ts
 * @description Singleton PrismaClient for Next.js.
 *
 * Next.js hot-reload (development) re-evaluates modules on every code change,
 * which would create a new PrismaClient instance on each reload and quickly
 * exhaust the PostgreSQL connection pool.
 *
 * The pattern below stores the client on the Node.js `globalThis` object, which
 * persists across hot-reload cycles. In production, `globalThis.prisma` is never
 * set, so a fresh PrismaClient is created once per process.
 *
 * Usage:
 *   import { prisma } from '@/lib/prisma';
 *   const sessions = await prisma.testSession.findMany();
 *
 * @see https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#prevent-hot-reloading-from-creating-new-instances-of-prismaclient
 */

import { PrismaClient } from '@prisma/client';

// Extend the global object type so TypeScript is aware of the cached instance.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

// Cache the instance in development only.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
