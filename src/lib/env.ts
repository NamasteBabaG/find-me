import { z } from "zod";

/**
 * Server-side environment, validated once. Everything defaults to a mock
 * so `npm run dev` works with zero external accounts.
 */
/** The one value that must never reach production: it signs sessions and asset URLs. */
const DEV_SESSION_SECRET = "dev-only-session-secret-change-me";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * What this deployment *is*, which NODE_ENV cannot say.
   *
   * A staging box runs a production build and is not a shop: it may pay with the
   * mock provider while generating for real, because the only money at risk is
   * ours and the only buyers are us. Saying so explicitly is the difference
   * between a deliberate QA environment and a shop that quietly takes no money.
   */
  APP_ENV: z.enum(["development", "qa", "production"]).optional(),
  DATABASE_URL: z.string().default("file:./dev.db"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).default(DEV_SESSION_SECRET),

  PAYMENT_PROVIDER: z.enum(["mock", "payme"]).default("mock"),
  GENERATION_PROVIDER: z.enum(["mock", "replicate", "openai"]).default("mock"),
  /** Kill switch. Set to "off" to stop every paid render without a deploy. */
  GENERATION_ENABLED: z.enum(["on", "off"]).default("on"),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  STORAGE_PROVIDER: z.enum(["local", "supabase", "db"]).default("local"),
  ANALYTICS_PROVIDER: z.enum(["console", "posthog", "none"]).default("console"),
  /** "inline" runs generation inside the request (serverless hosts); "in-process" defers to the next tick (dev). */
  JOBS_MODE: z.enum(["in-process", "inline"]).default("in-process"),
  /** Dev/test fallback for geo detection when no edge header is present (e.g. "IL"). */
  DEFAULT_COUNTRY: z.string().optional(),

  ADMIN_EMAILS: z.string().default(""),
  QA_AUTO_APPROVE: z.enum(["true", "false"]).default("false"),
  /** Explicit diagnostic escape hatch, QA only. Broken games must not ship by default. */
  QA_DELIVER_WITH_PROBLEMS: z.enum(["true", "false"]).default("false"),
  FEATURE_GIFT_WRAP: z.enum(["true", "false"]).default("true"),
  FEATURE_BONUS_CHARACTER: z.enum(["true", "false"]).default("false"),
  STORAGE_LOCAL_DIR: z.string().default("storage"),

  PAYME_SELLER_ID: z.string().optional(),
  PAYME_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  /** Vercel sets this and sends it as a bearer token on scheduled invocations. */
  CRON_SECRET: z.string().optional(),
  /** Image model for the character sheet and the slot patches. */
  GENERATION_MODEL: z.string().default("gpt-image-2"),
  GENERATION_QUALITY: z.enum(["low", "medium", "high"]).default("medium"),
  /** Hiding spots only. Unset means "the same as GENERATION_QUALITY". */
  GENERATION_PATCH_QUALITY: z.enum(["low", "medium", "high"]).optional(),
  /**
   * Quality for a hiding spot's SECOND and later attempts.
   *
   * Set this with a cheaper GENERATION_PATCH_QUALITY to pay little for the rolls
   * that work and more for the ones that do not: most spots land on the first
   * roll, and the ones that need another are the awkward ones worth spending on.
   * Unset means every attempt costs the same.
   */
  GENERATION_PATCH_RETRY_QUALITY: z.enum(["low", "medium", "high"]).optional(),
  /**
   * Pass two, the matte. It copies a render that already has the detail, so
   * low is enough (7 September: the same cut at low under a medium roll), and
   * it is a second image call per attempt, so it is the one to keep cheap.
   */
  GENERATION_MATTE_QUALITY: z.enum(["low", "medium", "high"]).default("low"),
  /**
   * How many hiding spots one tick paints at once. The provider's rate limit
   * (GENERATION_RPM) still binds; at 1 a world of 27 spots with three rolls
   * each took close to three hours (7 September), one attempt every two
   * minutes against a limit that allows five images a minute.
   */
  GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  /**
   * The most a single world may spend before a human is asked to look, in
   * cents. The default is the product's ceiling for the pathological case
   * (a world sells for about ten dollars); QA raises it to measure a whole
   * world at medium with retries.
   */
  GENERATION_WORLD_CENTS: z.coerce.number().int().min(100).default(600),
  /** A vision-capable chat model that checks a finished patch is really the child. */
  JUDGE_MODEL: z.string().default("gpt-4o-mini"),
  /**
   * Who decides on the board (see JudgePolicy in src/infra/generation/judge.ts):
   * `screen` (the fast reviewer may only end it on identity, face and
   * anatomy; placement, scale, age and style go to the strong reviewer),
   * `chain` (a fast fail on anything ends it), `strong` (the strong reviewer alone).
   */
  JUDGE_POLICY: z.enum(["screen", "chain", "strong"]).default("screen"),
  /** Images per minute this OpenAI account may request (tier 1 is 5). */
  GENERATION_RPM: z.coerce.number().int().positive().default(5),
  /** Generate hiding spot B as well. Off by default: one spot per target is a playable game. */
  GENERATION_BOTH_VARIANTS: z.enum(["true", "false"]).default("false"),
  EMAIL_FROM: z.string().default("איפה אני? <hello@example.com>"),
  /**
   * An operator's inbox for a finished game that has nobody to send it to.
   * Every such mail is stamped "[FALLBACK — no recipient]"; the game stays
   * READY rather than DELIVERED, because the parent does not have it.
   */
  EMAIL_FALLBACK_TO: z.string().email().optional(),
  /** On a QA box with a real painter: the only emails allowed to cause spend (comma-separated). */
  QA_TESTER_EMAILS: z.string().default(""),
  /** Real spend per UTC day, in US cents, after which the painter waits for tomorrow. 0 = no ceiling. */
  GENERATION_DAILY_CENTS: z.coerce.number().int().min(0).default(0),
  /** The commit this build was made from, for /api/health. Set at deploy time. */
  APP_COMMIT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * A setting as it was meant, not as it was pasted.
 *
 * On 11 September 2026 the QA site returned 500 on every page for twenty hours
 * because `GENERATION_ENABLED` held a byte order mark in front of the word:
 * `﻿off`. It is invisible in the dashboard, invisible in a copied string,
 * and the enum refused it - so `env()` threw, and because every route reads the
 * environment, every route died. The kill switch did not fail; one character
 * that nobody could see took down the site.
 *
 * A leading BOM or stray whitespace is never what a setting means. Trimming it
 * is not leniency about VALUES - an unrecognised value is still refused, loudly
 * - it is refusing to let an invisible character decide whether the site runs.
 */
const asTyped = (value: string) => value.replace(/^﻿/, "").trim();

export function env(): Env {
  if (cached) return cached;
  // Only the settings this schema knows: a key it does not validate is none of
  // its business, whitespace and all.
  const raw: Record<string, unknown> = { ...process.env };
  const repaired: string[] = [];
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    const typed = asTyped(value);
    if (typed === value) continue;
    raw[key] = typed;
    repaired.push(key);
  }
  // Said out loud once: an invisible character is not something anyone should
  // have to find by reading a stack trace.
  if (repaired.length) console.warn(`[env] trimmed invisible characters from: ${repaired.join(", ")} — fix the value where it is set.`);
  const vercelUrl = asTyped(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "");
  raw.APP_URL = raw.APP_URL ?? (vercelUrl ? `https://${vercelUrl}` : undefined);
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.SESSION_SECRET === DEV_SESSION_SECRET) {
    throw new Error("SESSION_SECRET is still the development default — set a real one before deploying (it signs sessions and asset URLs).");
  }
  // APP_URL ends up in share links, emails and payment redirects, so a localhost
  // fallback in production is silently wrong in the worst possible places.
  // VERCEL_URL is per-deployment and would bake a throwaway hostname into a
  // link a grandparent keeps, so it is a fallback, never the answer.
  if (parsed.data.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(parsed.data.APP_URL)) {
    throw new Error(`APP_URL is ${parsed.data.APP_URL} in production — set it to the real domain; share links and payment redirects are built from it.`);
  }
  // A shop that pays OpenAI per render and collects nothing is not
  // half-configured, it is a hole with a public URL. On a QA deployment that is
  // the intended state - we are the only buyers and it is our own money - so
  // the rule is keyed on what the deployment says it is, not on NODE_ENV, which
  // cannot tell a staging box from the real thing.
  const appEnv = parsed.data.APP_ENV ?? (parsed.data.NODE_ENV === "production" ? "production" : "development");
  if (appEnv === "production" && parsed.data.GENERATION_PROVIDER !== "mock" && parsed.data.PAYMENT_PROVIDER !== "payme") {
    throw new Error(
      `GENERATION_PROVIDER is "${parsed.data.GENERATION_PROVIDER}" while PAYMENT_PROVIDER is "${parsed.data.PAYMENT_PROVIDER}": every game would cost real money and collect none. Set PAYMENT_PROVIDER=payme, or GENERATION_PROVIDER=mock - or, if this deployment is a staging box, set APP_ENV=qa.`,
    );
  }
  // The same problem one step later: the render is paid for, the parent is
  // charged, and the link to the thing they bought is written to a file on a
  // server they cannot reach.
  if (appEnv === "production" && parsed.data.GENERATION_PROVIDER !== "mock" && parsed.data.EMAIL_PROVIDER !== "resend") {
    throw new Error(
      `EMAIL_PROVIDER is "${parsed.data.EMAIL_PROVIDER}" while GENERATION_PROVIDER is "${parsed.data.GENERATION_PROVIDER}": games would be generated and never delivered. Set EMAIL_PROVIDER=resend, or APP_ENV=qa.`,
    );
  }
  // A QA box with a real painter and no tester list is a public URL that spends
  // the project's money for anyone who finds it.
  if (appEnv === "qa" && parsed.data.GENERATION_PROVIDER !== "mock" && !parsed.data.QA_TESTER_EMAILS.trim()) {
    throw new Error("QA_TESTER_EMAILS is empty while GENERATION_PROVIDER is real: anyone with the URL could put renders on the project's account. List the testers, or set GENERATION_PROVIDER=mock.");
  }
  cached = { ...parsed.data, APP_ENV: appEnv };
  return cached;
}

export function isDev(): boolean {
  return env().NODE_ENV !== "production";
}

/** The real shop. A laptop and a staging box are not it. */
export function isLiveShop(): boolean {
  return env().APP_ENV === "production";
}

/** The spend policy, from the environment. */
export function spendGuard(): { appEnv: "development" | "qa" | "production"; realGeneration: boolean; testers: string[] } {
  const e = env();
  return {
    // env() always fills APP_ENV in; the schema's optional is for parsing only.
    appEnv: e.APP_ENV ?? "development",
    realGeneration: e.GENERATION_PROVIDER !== "mock",
    testers: e.QA_TESTER_EMAILS.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function flag(name: "FEATURE_GIFT_WRAP" | "FEATURE_BONUS_CHARACTER" | "QA_AUTO_APPROVE" | "QA_DELIVER_WITH_PROBLEMS" | "GENERATION_BOTH_VARIANTS"): boolean {
  return env()[name] === "true";
}
