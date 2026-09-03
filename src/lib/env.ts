import { z } from "zod";

/**
 * Server-side environment, validated once. Everything defaults to a mock
 * so `npm run dev` works with zero external accounts.
 */
/** The one value that must never reach production: it signs sessions and asset URLs. */
const DEV_SESSION_SECRET = "dev-only-session-secret-change-me";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).default(DEV_SESSION_SECRET),

  PAYMENT_PROVIDER: z.enum(["mock", "payme"]).default("mock"),
  GENERATION_PROVIDER: z.enum(["mock", "replicate", "openai"]).default("mock"),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  STORAGE_PROVIDER: z.enum(["local", "supabase", "db"]).default("local"),
  ANALYTICS_PROVIDER: z.enum(["console", "posthog", "none"]).default("console"),
  /** "inline" runs generation inside the request (serverless hosts); "in-process" defers to the next tick (dev). */
  JOBS_MODE: z.enum(["in-process", "inline"]).default("in-process"),
  /** Dev/test fallback for geo detection when no edge header is present (e.g. "IL"). */
  DEFAULT_COUNTRY: z.string().optional(),

  ADMIN_EMAILS: z.string().default(""),
  QA_AUTO_APPROVE: z.enum(["true", "false"]).default("false"),
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
  /** Images per minute this OpenAI account may request (tier 1 is 5). */
  GENERATION_RPM: z.coerce.number().int().positive().default(5),
  /** Generate hiding spot B as well. Off by default: one spot per target is a playable game. */
  GENERATION_BOTH_VARIANTS: z.enum(["true", "false"]).default("false"),
  EMAIL_FROM: z.string().default("איפה אני? <hello@example.com>"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const raw = { ...process.env, APP_URL: process.env.APP_URL ?? (vercelUrl ? `https://${vercelUrl}` : undefined) };
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
  cached = parsed.data;
  return cached;
}

export function isDev(): boolean {
  return env().NODE_ENV !== "production";
}

export function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function flag(name: "FEATURE_GIFT_WRAP" | "FEATURE_BONUS_CHARACTER" | "QA_AUTO_APPROVE" | "GENERATION_BOTH_VARIANTS"): boolean {
  return env()[name] === "true";
}
