import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * What a real shop refuses to boot with, and what a QA box is allowed.
 *
 * A QA audit found the live site reporting generation=openai, payment=mock and
 * email=console at once. In that state /api/dev/mock-pay marked any order PAID
 * from its id alone — and the id is in the checkout URL — so any visitor could
 * spend OpenAI budget, and nothing would ever be charged or delivered.
 *
 * These are boot-time errors rather than warnings on purpose: the previous
 * guard was a console.warn, which is exactly the kind of thing that stays true
 * for weeks before anyone reads it. They key on APP_ENV rather than NODE_ENV,
 * because a staging box runs a production build and is not a shop — there, mock
 * payment with real generation is the point, and the only money at risk is ours.
 */
const BASE = {
  NODE_ENV: "production",
  APP_URL: "https://example.com",
  SESSION_SECRET: "a-real-secret-that-is-not-the-dev-default-000000",
  DATABASE_URL: "file:./dev.db",
};

async function envWith(overrides: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...BASE, ...overrides })) vi.stubEnv(k, v);
  const { env } = await import("../env");
  return () => env();
}

afterEach(() => vi.unstubAllEnvs());

describe("the live shop", () => {
  it("refuses to boot when it would pay for renders and collect nothing", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "x" });
    expect(read).toThrow(/collect none/);
  });

  it("names the way out, so nobody has to guess which variable to set", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "x" });
    expect(read).toThrow(/APP_ENV=qa/);
  });

  it("refuses to boot when a paid-for game could never be delivered", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "payme", EMAIL_PROVIDER: "console" });
    expect(read).toThrow(/never delivered/);
  });

  it("allows a fully wired shop", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "payme", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "x" });
    expect(read).not.toThrow();
  });

  it("allows the honest demo: mock generation, mock payment, no money either way", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console" });
    expect(read).not.toThrow();
  });
});

describe("a QA deployment", () => {
  it("may generate for real while paying with the mock provider", async () => {
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console" });
    expect(read).not.toThrow();
    expect(read().APP_ENV).toBe("qa");
  });

  it("is not the live shop, so the app can say so out loud", async () => {
    const qa = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock" });
    qa();
    const { isLiveShop } = await import("../env");
    expect(isLiveShop()).toBe(false);
  });

  it("is what production defaults to when nothing says otherwise", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock" });
    expect(read().APP_ENV).toBe("production");
  });
});

describe("development", () => {
  it("is left alone, where every provider is a mock by design", async () => {
    const read = await envWith({ NODE_ENV: "development", GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console" });
    expect(read).not.toThrow();
    expect(read().APP_ENV).toBe("development");
  });
});
