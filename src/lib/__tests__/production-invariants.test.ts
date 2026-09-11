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
  it("may generate for real while paying with the mock provider, once it knows who may spend", async () => {
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console", QA_TESTER_EMAILS: "tester@example.com" });
    expect(read).not.toThrow();
    expect(read().APP_ENV).toBe("qa");
  });

  it("refuses a real painter with nobody listed: that is a public URL spending the project's money", async () => {
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "openai", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console", QA_TESTER_EMAILS: "" });
    expect(read).toThrow(/QA_TESTER_EMAILS/);
  });

  it("does not need a tester list while the painter is a mock", async () => {
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock", QA_TESTER_EMAILS: "" });
    expect(read).not.toThrow();
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

describe("a setting with an invisible character in it", () => {
  /**
   * QA returned 500 on every page for twenty hours because GENERATION_ENABLED
   * held a byte order mark in front of the word: the enum refused it, env()
   * threw, and every route reads the environment. One character nobody could
   * see took down the whole site.
   */
  it("reads the setting that was meant, and says it had to", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "mock", GENERATION_ENABLED: "\uFEFFoff" });
    expect(read).not.toThrow();
    expect(read().GENERATION_ENABLED).toBe("off");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("GENERATION_ENABLED"));
    warn.mockRestore();
  });

  it("does not let the trimming decide anything the value did not say", async () => {
    // Leniency about invisible characters is not leniency about values: a
    // setting nobody recognises is still refused, loudly.
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "mock", GENERATION_ENABLED: " paused " });
    expect(read).toThrow(/GENERATION_ENABLED/);
  });

  it("trims a pasted newline out of a URL", async () => {
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "mock", APP_URL: "https://qa.findmeworlds.com\n" });
    expect(read).not.toThrow();
    expect(read().APP_URL).toBe("https://qa.findmeworlds.com");
  });

  it("does not touch a credential, because its bytes ARE the credential", async () => {
    // The first version of this fix trimmed secrets too. Whitespace inside a
    // secret is somebody password, not a typo to repair, and repairing it
    // silently invalidates every signature already made with it.
    const padded = "  a-real-secret-that-is-not-the-dev-default-000000  ";
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "mock", SESSION_SECRET: padded, CRON_SECRET: " cron-token " });
    expect(read().SESSION_SECRET).toBe(padded);
    expect(read().CRON_SECRET).toBe(" cron-token ");

    const { hmacSign, hmacVerify } = await import("../ids");
    // A signature made before this change still verifies after it.
    expect(hmacVerify("payload", hmacSign("payload", padded), read().SESSION_SECRET)).toBe(true);
  });

  it("has decided, for every setting the schema knows, which kind it is", async () => {
    // A credential added later must not be trimmed by nobody having thought
    // about it, and a setting added later must not silently stop being read
    // the way the QA gate reads it.
    const { OPAQUE_ENV_KEYS, TYPED_ENV_KEYS } = await import("../env-value");
    const { ENV_SCHEMA_KEYS } = await import("../env");
    const classified = new Set([...OPAQUE_ENV_KEYS, ...TYPED_ENV_KEYS]);
    expect([...ENV_SCHEMA_KEYS].filter(key => !classified.has(key))).toEqual([]);
    expect(TYPED_ENV_KEYS.filter(key => OPAQUE_ENV_KEYS.has(key))).toEqual([]);
  });
});

describe("the QA password gate and the application it guards", () => {
  /**
   * The gate runs at the edge and reads `process.env` directly, so it cannot go
   * through the server env cache. When the two disagreed about what `APP_ENV`
   * says - a byte order mark in front of `qa` - the app booted as QA and the
   * front door switched itself off. An outage became an open door.
   */
  async function both(overrides: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries({ ...BASE, ...overrides })) vi.stubEnv(k, v);
    const { env } = await import("../env");
    const { qaAccessConfig } = await import("../qa-access");
    return { env, qaAccessConfig };
  }

  for (const [name, value] of [["a byte order mark", "\uFEFFqa"], ["padding", "  qa  "], ["a trailing newline", "qa\n"]] as const) {
    it(`still demands the password when APP_ENV carries ${name}`, async () => {
      const { env, qaAccessConfig } = await both({ APP_ENV: value, GENERATION_PROVIDER: "mock", QA_ACCESS_PASSWORD: "a-qa-password-long-enough" });
      expect(env().APP_ENV).toBe("qa");
      expect(qaAccessConfig().enabled, "the app is QA and its front door is not").toBe(true);
    });
  }

  it("holds the same secret on both sides, so a session signed by one verifies for the other", async () => {
    const padded = "  a-real-secret-that-is-not-the-dev-default-000000  ";
    const { env, qaAccessConfig } = await both({ APP_ENV: "qa", GENERATION_PROVIDER: "mock",
      SESSION_SECRET: padded, CRON_SECRET: " cron-token ", QA_ACCESS_PASSWORD: "a-qa-password-long-enough" });
    expect(qaAccessConfig().sessionSecret).toBe(env().SESSION_SECRET);
    expect(qaAccessConfig().cronSecret).toBe(env().CRON_SECRET);
  });

  it("marks its session cookie secure on the same reading of NODE_ENV the app uses", async () => {
    // The cookie flag and the app must not disagree either: a padded NODE_ENV
    // meant the app was production and the QA session cookie was not secure.
    const { env, qaAccessConfig } = await both({ NODE_ENV: "﻿production", APP_ENV: "qa",
      GENERATION_PROVIDER: "mock", QA_ACCESS_PASSWORD: "a-qa-password-long-enough" });
    expect(env().NODE_ENV).toBe("production");
    expect(qaAccessConfig().secure).toBe(true);
  });

  it("is still off when APP_ENV is genuinely something else", async () => {
    const { qaAccessConfig } = await both({ APP_ENV: "production", GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "payme" });
    expect(qaAccessConfig().enabled).toBe(false);
  });

  it("leaves a clean environment completely alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = await envWith({ APP_ENV: "qa", GENERATION_PROVIDER: "mock", GENERATION_ENABLED: "off" });
    expect(read().GENERATION_ENABLED).toBe("off");
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("[env] trimmed"));
    warn.mockRestore();
  });
});
