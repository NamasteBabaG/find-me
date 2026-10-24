import { z } from "zod";
import { assertPaymentActivationQualified } from "@/domain/payment-readiness";
import { envValue, normaliseEnvValue } from "./env-value";

/**
 * Server-side environment, validated once. Everything defaults to a mock
 * so `npm run dev` works with zero external accounts.
 */
/** The one value that must never reach production: it signs sessions and asset URLs. */
const DEV_SESSION_SECRET = "dev-only-session-secret-change-me";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).prefault("development"),
  /**
   * What this deployment *is*, which NODE_ENV cannot say.
   *
   * A staging box runs a production build and is not a shop: it may pay with the
   * mock provider while generating for real, because the only money at risk is
   * ours and the only buyers are us. Saying so explicitly is the difference
   * between a deliberate QA environment and a shop that quietly takes no money.
   */
  APP_ENV: z.enum(["development", "qa", "production"]).optional(),
  DATABASE_URL: z.string().prefault("file:./dev.db"),
  APP_URL: z.string().url().prefault("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).prefault(DEV_SESSION_SECRET),

  PAYMENT_PROVIDER: z.enum(["mock", "payme"]).prefault("mock"),
  /** Production creation and checkout stay closed until explicitly launched. QA/dev retain their existing flow. */
  PURCHASING_ENABLED: z.enum(["on", "off"]).prefault("off"),
  GENERATION_PROVIDER: z.enum(["mock", "replicate", "openai"]).prefault("mock"),
  /** Blocks new protected work in instances that loaded "off". Does not cancel
   * in-flight calls or govern every manual script; verify the deployed value. */
  GENERATION_ENABLED: z.enum(["on", "off"]).prefault("on"),
  /** Versioned visual calibration; existing paid questions still replay intact. */
  LOCAL_PATCH_PLAYER_REVIEW: z.enum(["on", "off"]).prefault("off"),
  /** Prospective QA release; captured on new drafts, never retroactive. */
  LOCAL_PATCH_VISUAL_REVIEW: z.enum(["legacy", "dual-high-v1", "dual-high-v2", "dual-high-v3"]).prefault("legacy"),
  /** Painter, diagnosis and identity-repair wording for NEW questions only: a
   * stored hide row or identity checkpoint keeps the release it started with. */
  /** Full original photo, painted facial volume and strict HIGH reference review; pinned only on fresh QA drafts. */
  LOCAL_PATCH_IDENTITY_SOURCE: z.enum(["legacy", "full-source-v1"]).prefault("legacy"),
  LOCAL_PATCH_PROMPT_RELEASE: z.enum(["v15", "v16", "v17", "v18", "v19"]).prefault("v15"),
  /** Painting quality for NEW local-patch drafts, pinned per game when the draft
   * is created; a game keeps its pin, and a game without one keeps its content
   * version's own quality (MEDIUM for v12). low-v1 is qualified only on QA with
   * v19 and dual-high-v3, and a draft is refused rather than painted otherwise. */
  LOCAL_PATCH_PAINTER: z.enum(["by-version", "low-v1"]).prefault("by-version"),
  /** How NEW local-patch drafts have their Opus quality questions delivered, pinned
   * per game: synchronously, or by Anthropic's Message Batches at half price with a
   * six-hour deadline. Qualified only on QA with dual-high-v3; never retroactive. */
  LOCAL_PATCH_QUALITY_CHANNEL: z.enum(["sync", "anthropic-batch-v1"]).prefault("sync"),
  /** local-patch-lean/v1 for NEW local-patch drafts, pinned per game: MEDIUM paintings, Sol 6.1 as the
   * only judge on Flex, planned variety, the pushed-back Antarctica hat, no paid diagnosis for a subject
   * refusal and a world aiming under three dollars within a four-dollar ceiling. It replaces the LOW painter, Message Batches and six-dollar pins
   * for the draft it is pinned to. Qualified only on QA with v19 and dual-high-v3; never retroactive. */
  LOCAL_PATCH_LEAN: z.enum(["off", "lean-v1"]).prefault("off"),
  /** Explorers/Detectives cards under the child's name. On qa/production they
   * appear only while a Detectives world can actually be sold
   * (content/worlds/detective-releases.ts); development shows them for review. */
  SEARCH_LEVEL_CHOICE: z.enum(["on", "off"]).prefault("off"),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).prefault("console"),
  STORAGE_PROVIDER: z.enum(["local", "supabase", "db"]).prefault("local"),
  ANALYTICS_PROVIDER: z.enum(["console", "posthog", "none"]).prefault("console"),
  /** "inline" runs generation inside the request (serverless hosts); "in-process" defers to the next tick (dev). */
  JOBS_MODE: z.enum(["in-process", "inline"]).prefault("in-process"),
  /** Dev/test fallback for geo detection when no edge header is present (e.g. "IL"). */
  DEFAULT_COUNTRY: z.string().optional(),

  ADMIN_EMAILS: z.string().prefault(""),
  QA_AUTO_APPROVE: z.enum(["true", "false"]).prefault("false"),
  /** Explicit diagnostic escape hatch, QA only. Broken games must not ship by default. */
  QA_DELIVER_WITH_PROBLEMS: z.enum(["true", "false"]).prefault("false"),
  FEATURE_GIFT_WRAP: z.enum(["true", "false"]).prefault("true"),
  FEATURE_BONUS_CHARACTER: z.enum(["true", "false"]).prefault("false"),
  STORAGE_LOCAL_DIR: z.string().prefault("storage"),

  PAYME_SELLER_ID: z.string().optional(),
  PAYME_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Vercel sets this and sends it as a bearer token on scheduled invocations. */
  CRON_SECRET: z.string().optional(),
  /** Image model for the character sheet and the slot patches. */
  GENERATION_MODEL: z.string().prefault("gpt-image-2"),
  GENERATION_QUALITY: z.enum(["low", "medium", "high"]).prefault("medium"),
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
  GENERATION_MATTE_QUALITY: z.enum(["low", "medium", "high"]).prefault("low"),
  /**
   * How many hiding spots one tick paints at once. The provider's rate limit
   * (GENERATION_RPM) still binds; at 1 a world of 27 spots with three rolls
   * each took close to three hours (7 September), one attempt every two
   * minutes against a limit that allows five images a minute.
   */
  GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(8).prefault(1),
  /**
   * The most a single world may spend before a human is asked to look, in
   * cents. The default is the product's ceiling for the pathological case
   * (a world sells for about ten dollars); QA raises it to measure a whole
   * world at medium with retries.
   */
  GENERATION_WORLD_CENTS: z.coerce.number().int().min(100).prefault(600),
  /** A vision-capable chat model that checks a finished patch is really the child. */
  JUDGE_MODEL: z.string().prefault("gpt-4o-mini"),
  /**
   * Who decides on the board (see JudgePolicy in src/infra/generation/judge.ts):
   * `screen` (the fast reviewer may only end it on identity, face and
   * anatomy; placement, scale, age and style go to the strong reviewer),
   * `chain` (a fast fail on anything ends it), `strong` (the strong reviewer alone).
   */
  JUDGE_POLICY: z.enum(["screen", "chain", "strong"]).prefault("screen"),
  /** Images per minute this OpenAI account may request (tier 1 is 5). */
  GENERATION_RPM: z.coerce.number().int().positive().prefault(5),
  /** Generate hiding spot B as well. Off by default: one spot per target is a playable game. */
  GENERATION_BOTH_VARIANTS: z.enum(["true", "false"]).prefault("false"),
  EMAIL_FROM: z.string().prefault("איפה אני? <hello@example.com>"),
  /**
   * An operator's inbox for a finished game that has nobody to send it to.
   * Every such mail is stamped "[FALLBACK — no recipient]"; the game stays
   * READY rather than DELIVERED, because the parent does not have it.
   */
  EMAIL_FALLBACK_TO: z.string().email().optional(),
  /** On a QA box with a real painter: the only emails allowed to cause spend (comma-separated). */
  QA_TESTER_EMAILS: z.string().prefault(""),
  /** Real spend per UTC day, in US cents, after which the painter waits for tomorrow. 0 = no ceiling. */
  GENERATION_DAILY_CENTS: z.coerce.number().int().min(0).prefault(0),
  /** The commit this build was made from, for /api/health. Set at deploy time. */
  APP_COMMIT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
/** Every setting this schema validates, so a test can hold env-value.ts to it. */
export const ENV_SCHEMA_KEYS: readonly string[] = Object.keys(EnvSchema.shape);

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // How a setting is read lives in env-value.ts, so the edge-side QA gate reads
  // it the same way. Reading `APP_ENV` differently here than the front door does
  // is how one fix for an outage became an open door.
  const raw: Record<string, unknown> = { ...process.env };
  const repaired: string[] = [];
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    const typed = envValue(key, value);
    if (typed === value) continue;
    raw[key] = typed;
    repaired.push(key);
  }
  // Said out loud once: an invisible character is not something anyone should
  // have to find by reading a stack trace. Names only, never values.
  if (repaired.length) console.warn(`[env] trimmed invisible characters from: ${repaired.join(", ")} — fix the value where it is set.`);
  const vercelUrl = normaliseEnvValue(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "");
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
  if (appEnv === "production" && parsed.data.PURCHASING_ENABLED === "on" && parsed.data.PAYMENT_PROVIDER !== "payme") {
    throw new Error("PURCHASING_ENABLED=on requires PAYMENT_PROVIDER=payme in production — simulated purchases must remain closed.");
  }
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
  assertPaymentActivationQualified({ appEnv, provider: parsed.data.PAYMENT_PROVIDER,
    purchasingEnabled: parsed.data.PURCHASING_ENABLED === "on", realGeneration: parsed.data.GENERATION_PROVIDER !== "mock" });
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
