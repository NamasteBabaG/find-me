import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import { envValue } from "@/lib/env-value";
import { boundedRuntimeDatabaseUrl } from "./runtime-url";

/**
 * Postgres/SQLite is the source of truth. One client per process; in dev the
 * instance is cached on globalThis so hot reloads don't leak connections.
 */
const globalForPrisma = globalThis as unknown as { __findmePrisma?: PrismaClient };
const sandbox = envValue("APP_ENV", process.env.APP_ENV) === "qa"
  && envValue("PAYMENT_PROVIDER", process.env.PAYMENT_PROVIDER) === "payme"
  && envValue("PAYME_ENVIRONMENT", process.env.PAYME_ENVIRONMENT) === "sandbox";
const runtimeUrl = boundedRuntimeDatabaseUrl(sandbox || envValue("QA_WIZARD_MOCK", process.env.QA_WIZARD_MOCK) === "on"
  ? env().DATABASE_URL
  : process.env.DATABASE_URL);

export const prisma: PrismaClient =
  globalForPrisma.__findmePrisma ??
  new PrismaClient({
    ...(runtimeUrl ? { datasources: { db: { url: runtimeUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__findmePrisma = prisma;

export type Db = PrismaClient;
