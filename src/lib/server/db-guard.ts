import { flowError, type FlowError } from "@/i18n/errors";

const DB_HINTS = [
  "PrismaClient",
  "Can't reach database",
  "Error querying the database",
  "Environment variable not found",
  "database file",
  "SQLITE_",
  "ECONNREFUSED",
  "ENOTFOUND",
  "connect ETIMEDOUT",
  "Unable to open the database file",
  "attempt to write a readonly database",
];

/** True when the failure is "no usable database", not a bug in the flow. */
export function isDatabaseError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return DB_HINTS.some((h) => msg.includes(h));
}

/**
 * Runs a create-flow step and converts an unusable database into a friendly
 * error code. Anything else keeps throwing, so real bugs stay visible.
 */
export async function guardDb<T>(fn: () => Promise<T>): Promise<T | FlowError> {
  try {
    return await fn();
  } catch (err) {
    if (isDatabaseError(err)) {
      console.error("[db] unavailable:", err instanceof Error ? err.message.split("\n")[0] : err);
      return flowError("SERVICE_UNAVAILABLE", "השירות לא זמין כרגע.");
    }
    throw err;
  }
}
