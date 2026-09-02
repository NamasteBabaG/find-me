import { z } from "zod";

/**
 * Server-side environment, validated once. Everything defaults to a mock
 * so `npm run dev` works with zero external accounts.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).default("dev-only-session-secret-change-me"),

  PAYMENT_PROVIDER: z.enum(["mock", "payme"]).default("mock"),
  GENERATION_PROVIDER: z.enum(["mock", "replicate", "openai"]).default("mock"),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  ANALYTICS_PROVIDER: z.enum(["console", "posthog", "none"]).default("console"),

  ADMIN_EMAILS: z.string().default(""),
  QA_AUTO_APPROVE: z.enum(["true", "false"]).default("false"),
  FEATURE_GIFT_WRAP: z.enum(["true", "false"]).default("true"),
  FEATURE_BONUS_CHARACTER: z.enum(["true", "false"]).default("false"),
  STORAGE_LOCAL_DIR: z.string().default("storage"),

  PAYME_SELLER_ID: z.string().optional(),
  PAYME_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("איפה אני? <hello@example.com>"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
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

export function flag(name: "FEATURE_GIFT_WRAP" | "FEATURE_BONUS_CHARACTER" | "QA_AUTO_APPROVE"): boolean {
  return env()[name] === "true";
}
