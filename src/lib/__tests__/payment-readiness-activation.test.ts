import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  const settings = { NODE_ENV: "production", APP_ENV: "production", APP_URL: "https://payment-test.invalid",
    SESSION_SECRET: "synthetic-payment-readiness-session-secret-not-a-credential", DATABASE_URL: "file:./payment-readiness-test.db",
    PAYMENT_PROVIDER: "payme", PURCHASING_ENABLED: "on", GENERATION_PROVIDER: "mock", EMAIL_PROVIDER: "console",
    PAYME_SELLER_ID: "synthetic-seller", PAYME_WEBHOOK_SECRET: "synthetic-webhook-not-a-real-credential",
    QA_TESTER_EMAILS: "tester@example.invalid" };
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("payment activation qualification", () => {
  it("refuses production purchases before PayMe is qualified", async () => {
    const { env } = await import("../env");
    expect(() => env()).toThrow(/not qualified/);
  });
  it("refuses paid generation through an unqualified real-payment adapter even while new purchasing is closed", async () => {
    vi.stubEnv("PURCHASING_ENABLED", "off"); vi.stubEnv("GENERATION_PROVIDER", "openai"); vi.stubEnv("EMAIL_PROVIDER", "resend");
    const { env } = await import("../env");
    expect(() => env()).toThrow(/not qualified/);
  });
  it("keeps the explicitly protected QA mock flow available", async () => {
    vi.stubEnv("APP_ENV", "qa"); vi.stubEnv("PAYMENT_PROVIDER", "mock");
    const { env } = await import("../env");
    expect(env()).toMatchObject({ APP_ENV: "qa", PAYMENT_PROVIDER: "mock", PURCHASING_ENABLED: "on" });
  });
  it("admits the PayMe test account with isolated QA storage and a deployment-local callback", async () => {
    vi.stubEnv("APP_ENV", "qa"); vi.stubEnv("PAYME_ENVIRONMENT", "sandbox");
    vi.stubEnv("STORAGE_PROVIDER", "db"); vi.stubEnv("APP_URL", undefined);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "public-qa.example.invalid");
    vi.stubEnv("VERCEL_URL", "payment-sandbox.example.invalid");
    vi.stubEnv("DATABASE_URL", "postgresql://sandbox:test@database.example.invalid/sandbox?schema=qa");
    const { env, spendGuard } = await import("../env");
    expect(env()).toMatchObject({ APP_URL: "https://payment-sandbox.example.invalid", PAYME_ENVIRONMENT: "sandbox" });
    expect(new URL(env().DATABASE_URL).searchParams.get("schema")).toBe("qa_payme_sandbox");
    expect(spendGuard()).toMatchObject({ realGeneration: false, paymeSandbox: true, testers: ["tester@example.invalid"] });
  });
  it.each([["PAYME_ENVIRONMENT", "live"], ["APP_ENV", "production"], ["GENERATION_PROVIDER", "openai"],
    ["STORAGE_PROVIDER", "local"], ["DATABASE_URL", "postgresql://sandbox:test@database.example.invalid/sandbox?schema=public"],
    ["PAYME_SELLER_ID", ""], ["QA_TESTER_EMAILS", ""]])("rejects a PayMe sandbox with unsafe %s", async (key, value) => {
    vi.stubEnv("APP_ENV", "qa"); vi.stubEnv("PAYME_ENVIRONMENT", "sandbox"); vi.stubEnv("STORAGE_PROVIDER", "db");
    vi.stubEnv("DATABASE_URL", "postgresql://sandbox:test@database.example.invalid/sandbox?schema=qa");
    vi.stubEnv(key, value);
    const { env } = await import("../env");
    expect(() => env()).toThrow();
  });
  it("keeps a closed mock-only production foundation available without representing it as a shop", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock"); vi.stubEnv("PURCHASING_ENABLED", "off");
    const { env } = await import("../env");
    expect(env()).toMatchObject({ APP_ENV: "production", PAYMENT_PROVIDER: "mock", GENERATION_PROVIDER: "mock", PURCHASING_ENABLED: "off" });
  });
});
