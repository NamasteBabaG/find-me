import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * What production refuses to boot with.
 *
 * A QA audit found the live site reporting generation=openai, payment=mock and
 * email=console at once. In that state /api/dev/mock-pay marks any order PAID
 * from its id alone — and the id is in the checkout URL — so every visitor
 * could spend OpenAI budget, and nothing would ever be delivered or charged.
 *
 * These are boot-time errors rather than warnings on purpose. The previous
 * guard was a console.warn, which is exactly the kind of thing that is true for
 * weeks before anyone reads it.
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

describe("production provider invariants", () => {
  it("refuses to boot when it would pay for renders and collect nothing", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "x" });
    expect(read).toThrow(/collect none/);
  });

  it("refuses to boot when a paid-for game could never be delivered", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "payme", EMAIL_PROVIDER: "console" });
    expect(read).toThrow(/never delivered/);
  });

  it("allows the honest demo: mock generation, mock payment, no money either way", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console" });
    expect(read).not.toThrow();
  });

  it("allows a fully wired shop", async () => {
    const read = await envWith({ GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "payme", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "x" });
    expect(read).not.toThrow();
  });

  it("leaves development alone, where every provider is a mock by design", async () => {
    const read = await envWith({ NODE_ENV: "development", GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console" });
    expect(read).not.toThrow();
  });
});

describe("the mock payment endpoint", () => {
  it("does not exist in production, whatever provider happens to be wired", async () => {
    vi.resetModules();
    for (const [k, v] of Object.entries({ ...BASE, GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock" })) vi.stubEnv(k, v);
    const { POST } = await import("../../app/api/dev/mock-pay/route");
    const res = await POST(new Request("https://example.com/api/dev/mock-pay", { method: "POST", body: "{}" }));
    expect(res.status).toBe(404);
    // It must not have reached the database or the webhook handler to say so.
    expect(await res.json()).toMatchObject({ ok: false });
  });
});

