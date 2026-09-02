import { PrismaClient } from "@prisma/client";

/**
 * Postgres/SQLite is the source of truth. One client per process; in dev the
 * instance is cached on globalThis so hot reloads don't leak connections.
 */
const globalForPrisma = globalThis as unknown as { __findmePrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__findmePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__findmePrisma = prisma;

export type Db = PrismaClient;
