import { beforeEach, describe, expect, it, vi } from "vitest";
import { startCheckout } from "../order.service";
import type { Container } from "../container";

const draft = vi.hoisted(() => ({ locale: "he" }));
vi.mock("../create-flow.service", () => ({ loadDraft: async () => ({ id: "game", locale: draft.locale, status: "CHECKOUT_PENDING", packageTier: "ONE_WORLD", scenes: Array(9).fill({}), childProfile: { id: "child", displayName: "Test" } }) }));
vi.mock("../auth.service", () => ({ ensureUser: async () => ({ id: "user", email: "test@example.com" }) }));
vi.mock("@/domain/spend-policy", () => ({ spendAllowedFor: () => true }));
beforeEach(() => { draft.locale = "he"; });

describe("checkout currency contract", () => {
  it.each([undefined, "he", "en", "EUR", ""])('rejects %s before any database or payment side effect', async currency => {
    // No container is needed: omitted/invalid currency must fail before use.
    await expect(startCheckout(null as unknown as Container, { gameId: "test", email: "test@example.com", currency: currency as never })).rejects.toThrow("server-resolved currency");
  });
  it.each([
    ["he", "USD", 2200], ["en", "ILS", 5900],
    ["he", "ILS", 5900], ["en", "USD", 2200],
  ] as const)("preserves server currency %s/%s in both order and payment", async (locale, currency, amount) => {
    draft.locale = locale;
    const orderCreate = vi.fn(async ({ data }) => data);
    const payment = vi.fn(async () => ({ checkoutUrl: "https://payments.example/test" }));
    const c = {
      appUrl: "https://example.test",
      db: { user: { update: vi.fn() }, game: { update: vi.fn() }, childProfile: { update: vi.fn() }, order: { findFirst: vi.fn(async () => null), create: orderCreate, update: vi.fn() } },
      payment: { id: "mock", createCheckout: payment }, analytics: { track: vi.fn() },
    } as unknown as Container;
    expect((await startCheckout(c, { gameId: "game", email: "test@example.com", currency })).ok).toBe(true);
    expect(orderCreate.mock.calls[0]![0].data).toMatchObject({ currency, amountAgorot: amount });
    expect(payment).toHaveBeenCalledWith(expect.objectContaining({ currency, amountAgorot: amount }));
  });
});
