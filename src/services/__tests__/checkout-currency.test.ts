import { beforeEach, describe, expect, it, vi } from "vitest";
import { startCheckout } from "../order.service";
import type { Container } from "../container";

const draft = vi.hoisted(() => ({ locale: "he" }));
vi.mock("../create-flow.service", () => ({ draftBelongsTo: () => true, loadDraft: async () => ({ id: "game", ownerId: "user", draftToken: "test-draft", childProfileId: "child", locale: draft.locale, status: "CHECKOUT_PENDING", packageTier: "ONE_WORLD", scenes: Array(9).fill({}), childProfile: { id: "child", displayName: "Test", originalPhotoAssetId: "photo" } }) }));
vi.mock("../auth.service", () => ({ ensureUser: async () => ({ id: "user", email: "test@example.com" }) }));
vi.mock("@/domain/spend-policy", () => ({ spendAllowedFor: () => true }));
beforeEach(() => { draft.locale = "he"; });

describe("checkout currency contract", () => {
  it.each([undefined, "he", "en", "EUR", ""])('rejects %s before any database or payment side effect', async currency => {
    // No container is needed: omitted/invalid currency must fail before use.
    await expect(startCheckout(null as unknown as Container, { gameId: "test", email: "test@example.com", currency: currency as never, access: { draftToken: null, userId: null } })).rejects.toThrow("server-resolved currency");
  });
  it.each([
    ["he", "USD", 2200], ["en", "ILS", 5900],
    ["he", "ILS", 5900], ["en", "USD", 2200],
  ] as const)("preserves server currency %s/%s in both order and payment", async (locale, currency, amount) => {
    draft.locale = locale;
    const orderCreate = vi.fn(async ({ data }) => data);
    const payment = vi.fn(async () => ({ checkoutUrl: "https://payments.example/test" }));
    const transactionDb = {
      user: { update: vi.fn() },
      game: { findUnique: vi.fn(async () => ({ ownerId: "user", childProfileId: "child", status: "CHECKOUT_PENDING", draftToken: "test-draft", updatedAt: new Date() })), updateMany: vi.fn(async () => ({ count: 1 })), count: vi.fn(async () => 0) },
      childProfile: { findUnique: vi.fn(async () => ({ id: "child", ownerId: "user", originalPhotoAssetId: "photo", avatarAssetId: null, identityAssetId: null })), count: vi.fn(async () => 0), updateMany: vi.fn(async () => ({ count: 1 })) },
      asset: { findUnique: vi.fn(async () => ({ id: "photo", ownerId: "user", type: "ORIGINAL_PHOTO", visibility: "PRIVATE", status: "READY", storagePath: "private/photo.png" })), count: vi.fn(async () => 1), updateMany: vi.fn(async () => ({ count: 1 })) },
    };
    const c = {
      appUrl: "https://example.test",
      db: { $transaction: async (callback: (tx: typeof transactionDb) => Promise<void>) => callback(transactionDb), order: { findFirst: vi.fn(async () => null), create: orderCreate, update: vi.fn() } },
      payment: { id: "mock", createCheckout: payment }, analytics: { track: vi.fn() },
    } as unknown as Container;
    expect((await startCheckout(c, { gameId: "game", email: "test@example.com", currency, access: { draftToken: "test-draft", userId: "user" } })).ok).toBe(true);
    expect(orderCreate.mock.calls[0]![0].data).toMatchObject({ currency, amountAgorot: amount });
    expect(payment).toHaveBeenCalledWith(expect.objectContaining({ currency, amountAgorot: amount }));
  });
});
