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
  it("refuses production purchases even when the unimplemented PayMe adapter has credential-shaped settings", async () => {
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
  it("keeps a closed mock-only production foundation available without representing it as a shop", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock"); vi.stubEnv("PURCHASING_ENABLED", "off");
    const { env } = await import("../env");
    expect(env()).toMatchObject({ APP_ENV: "production", PAYMENT_PROVIDER: "mock", GENERATION_PROVIDER: "mock", PURCHASING_ENABLED: "off" });
  });
});
