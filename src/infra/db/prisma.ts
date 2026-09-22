import { PrismaClient } from "@prisma/client";
import { boundedRuntimeDatabaseUrl } from "./runtime-url";

/**
 * Postgres/SQLite is the source of truth. One client per process; in dev the
 * instance is cached on globalThis so hot reloads don't leak connections.
 */
const globalForPrisma = globalThis as unknown as { __findmePrisma?: PrismaClient };
const runtimeUrl = boundedRuntimeDatabaseUrl(process.env.DATABASE_URL);

export const prisma: PrismaClient =
  globalForPrisma.__findmePrisma ??
  new PrismaClient({
    ...(runtimeUrl ? { datasources: { db: { url: runtimeUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__findmePrisma = prisma;

export type Db = PrismaClient;
