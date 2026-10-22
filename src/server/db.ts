import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireConfig } from "./config";

/**
 * One Prisma client per server process. It is created lazily so that builds
 * and the "setup required" screen work without a DATABASE_URL, and cached on
 * globalThis so dev-server hot reloads don't open new connection pools.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const { databaseUrl } = requireConfig();
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }
  return globalForPrisma.prisma;
}
