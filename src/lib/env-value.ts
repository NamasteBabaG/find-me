/**
 * How a setting is read, in one place, for everything that reads one.
 *
 * Two separate incidents live in this file.
 *
 * THE FIRST: on 11 September 2026 QA returned 500 on every page for twenty
 * hours because `GENERATION_ENABLED` held a byte order mark in front of the
 * word - `﻿off`. Invisible in a dashboard, invisible in a copied string, and
 * the enum refused it, so `env()` threw and every route with it. An invisible
 * character should not be able to decide whether a site runs.
 *
 * THE SECOND was the fix for the first, and it was worse. Trimming happened
 * inside `env()` only, so the app booted as QA on a `﻿qa` while the QA
 * password gate - which reads `process.env` directly, because it runs at the
 * edge - still saw a value that was not `qa` and turned itself OFF. An outage
 * became an open door. The same trimming also reached SESSION_SECRET and
 * CRON_SECRET, and a credential is not a label: changing its bytes changes the
 * key, and the gate and the app then held different ones.
 *
 * So: one rule, here, importable from the edge, and an explicit answer for
 * every setting in the schema.
 *
 *  - A setting drawn from a fixed vocabulary or a structural format is read as
 *    it was MEANT. Whitespace around `qa` or a URL is never part of it.
 *  - A credential is read as it IS. Its bytes are the secret; whitespace inside
 *    one is somebody's password, not a typo to repair, and repairing it
 *    silently invalidates every signature already made with it.
 *
 * Nothing here is lenient about VALUES. An unrecognised setting is still
 * refused, loudly, by the schema that owns it.
 */

/** Strips a leading byte order mark and surrounding whitespace. Nothing else. */
export const normaliseEnvValue = (value: string) => value.replace(/^﻿/, "").trim();

/**
 * Settings whose bytes ARE the value. Never touched.
 *
 * A key must be in exactly one of these two sets, and a test holds the schema
 * to it, so a credential added later cannot be trimmed by forgetting about it.
 */
export const OPAQUE_ENV_KEYS: ReadonlySet<string> = new Set([
  "SESSION_SECRET",
  "CRON_SECRET",
  "PAYME_WEBHOOK_SECRET",
  "PAYME_SELLER_ID",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
]);

/** Settings read as they were meant. Everything the schema knows that is not a credential. */
export const TYPED_ENV_KEYS: readonly string[] = [
  "NODE_ENV", "APP_ENV", "DATABASE_URL", "APP_URL",
  "PAYMENT_PROVIDER", "GENERATION_PROVIDER", "GENERATION_ENABLED",
  "EMAIL_PROVIDER", "STORAGE_PROVIDER", "ANALYTICS_PROVIDER", "JOBS_MODE",
  "DEFAULT_COUNTRY", "ADMIN_EMAILS",
  "QA_AUTO_APPROVE", "QA_DELIVER_WITH_PROBLEMS", "FEATURE_GIFT_WRAP", "FEATURE_BONUS_CHARACTER",
  "STORAGE_LOCAL_DIR",
  "GENERATION_MODEL", "GENERATION_QUALITY", "GENERATION_PATCH_QUALITY",
  "GENERATION_PATCH_RETRY_QUALITY", "GENERATION_MATTE_QUALITY",
  "GENERATION_CONCURRENCY", "GENERATION_WORLD_CENTS", "GENERATION_RPM",
  "GENERATION_BOTH_VARIANTS", "GENERATION_DAILY_CENTS",
  "JUDGE_MODEL", "JUDGE_POLICY",
  "EMAIL_FROM", "EMAIL_FALLBACK_TO", "QA_TESTER_EMAILS",
  "APP_COMMIT",
];
const TYPED = new Set(TYPED_ENV_KEYS);

/**
 * One setting, read the way everything must read it.
 *
 * `qa-access.ts` and the middleware call this on `process.env` directly rather
 * than through `env()`, because they run at the edge - and calling it is the
 * whole point: the app and its front door have to agree about what `APP_ENV`
 * says.
 */
export function envValue(key: string, value: string | undefined): string | undefined {
  if (value === undefined || !TYPED.has(key)) return value;
  return normaliseEnvValue(value);
}
